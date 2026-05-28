"""批次匯入使用者推薦的咖啡廳。

讀取 `cafe_recommendations` 表中 status='pending' 的紀錄,對每一筆:
  1. 若 google_place_id 已存在於 cafes → 直接標記 status='imported'
     (imported_cafe_id 連到既有 row),不重跑 pipeline。
  2. 否則 → insert 新 cafes 列(source='user_submitted'),
     依序跑完整 pipeline (pinyin → scrape → photos → extract → semantic → ai_summary)。
     成功則標 imported;失敗則保留 pending,下次重跑時繼續嘗試。

為什麼用 subprocess 跑 pipeline 各 stage,而不是 import:
  各 stage 都有自己的 argparse main();subprocess 隔離也避免 Playwright
  crash 拖垮整個 script(和 services/api/worker.py 一樣的考量)。

Usage::

    uv run python -m coffee_pocket.agents.sources.import_recommendations              # dry-run
    uv run python -m coffee_pocket.agents.sources.import_recommendations --apply      # 實際匯入
    uv run python -m coffee_pocket.agents.sources.import_recommendations --apply --limit 5
"""

from __future__ import annotations

import argparse
import logging
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ...db import get_client

logger = logging.getLogger(__name__)

# Stage 3 (google_extract) 預設掃 data/reviews/*.json;這裡保留路徑供 --file 用。
REVIEWS_DIR = Path(__file__).resolve().parents[4] / "data" / "reviews"

STAGE_TIMEOUT_S = 60 * 15  # 每個 stage 上限 15 分鐘


def _run_stage(label: str, argv: list[str]) -> bool:
    """同步跑一個 pipeline stage。stdout/stderr 直接 stream 到當前 console。"""
    logger.info("[stage=%s] start: %s", label, " ".join(argv))
    try:
        proc = subprocess.run(argv, timeout=STAGE_TIMEOUT_S, check=False)
    except subprocess.TimeoutExpired:
        logger.error("[stage=%s] TIMED OUT after %ds", label, STAGE_TIMEOUT_S)
        return False
    ok = proc.returncode == 0
    if ok:
        logger.info("[stage=%s] OK", label)
    else:
        logger.error("[stage=%s] FAILED rc=%s", label, proc.returncode)
    return ok


def _run_pipeline(cafe_id: str, place_id: str) -> bool:
    """跑 pinyin → scrape → photos → extract → semantic → ai_summary。

    Stage 2.5(photos)和最後的 ai_summary 失敗不算整體失敗 ── 對應
    services/api/worker.py 裡的 non-blocking 策略。其他 stage 任一失敗就 return False。
    """
    pinyin_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.prepare.generate_pinyin",
        "--apply",
    ]
    if not _run_stage("pinyin", pinyin_argv):
        return False

    scrape_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.enrich.google_scraper",
        "--cafe-id", cafe_id,
        "--update-cafe",
    ]
    if not _run_stage("scrape", scrape_argv):
        return False

    # photos 失敗不擋 ── cover_image_url 在 scrape 已 fallback 設好。
    photos_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.enrich.google_photos_scraper",
        "--cafe-id", cafe_id,
    ]
    _run_stage("photos", photos_argv)

    extract_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.process.google_extract",
    ]
    target = REVIEWS_DIR / f"{place_id}.json"
    if target.exists():
        extract_argv.extend(["--file", str(target)])
    else:
        logger.warning("expected reviews file missing: %s — fallback to bulk extract", target)
    if not _run_stage("extract", extract_argv):
        return False

    semantic_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.process.semantic",
        "--cafe-id", cafe_id,
    ]
    if not _run_stage("semantic", semantic_argv):
        return False

    summary_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.process.ai_summary",
        "--cafe-id", cafe_id,
    ]
    _run_stage("ai_summary", summary_argv)  # 失敗不擋

    return True


def _mark_imported(rec_id: str, cafe_id: str) -> None:
    get_client().table("cafe_recommendations").update({
        "status": "imported",
        "imported_cafe_id": cafe_id,
        "imported_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", rec_id).execute()


def _insert_cafe(rec: dict[str, Any]) -> str:
    inserted = (
        get_client()
        .table("cafes")
        .insert({
            "name": rec["name"],
            "address": rec.get("address"),
            "google_place_id": rec["google_place_id"],
            "google_maps_url": rec.get("google_maps_url"),
            "location": f"SRID=4326;POINT({float(rec['lng'])} {float(rec['lat'])})",
            "source": "user_submitted",
        })
        .execute()
        .data
    )
    if not inserted:
        raise RuntimeError(f"failed to insert cafe for recommendation {rec['id']}")
    return inserted[0]["id"]


def _bulk_mark_imported_for_existing(
    pending: list[dict[str, Any]],
    existing_by_pid: dict[str, str],
) -> tuple[list[dict[str, Any]], int]:
    """把推薦但已在 cafes 的紀錄直接標 imported,回傳剩下真正要跑 pipeline 的清單。"""
    needs_pipeline: list[dict[str, Any]] = []
    already = 0
    for rec in pending:
        cafe_id = existing_by_pid.get(rec["google_place_id"])
        if cafe_id:
            _mark_imported(rec["id"], cafe_id)
            already += 1
            print(f"  = already in cafes: {rec['name']!r} → {cafe_id}")
        else:
            needs_pipeline.append(rec)
    return needs_pipeline, already


def run(*, apply: bool, limit: int | None) -> None:
    db = get_client()

    q = (
        db.table("cafe_recommendations")
        .select("id, google_place_id, name, address, lng, lat, google_maps_url, created_at")
        .eq("status", "pending")
        .order("created_at", desc=False)
    )
    if limit:
        q = q.limit(limit)
    pending = q.execute().data or []

    if not pending:
        print("沒有待處理的推薦。")
        return

    pids = [r["google_place_id"] for r in pending]
    existing_rows = (
        db.table("cafes")
        .select("id, google_place_id")
        .in_("google_place_id", pids)
        .execute()
        .data
        or []
    )
    existing_by_pid: dict[str, str] = {
        row["google_place_id"]: row["id"] for row in existing_rows if row.get("google_place_id")
    }

    print(f"待處理 {len(pending)} 筆;其中 {len(existing_by_pid)} 筆已在 cafes 表。")
    if not apply:
        print("(dry-run; 加 --apply 才會真的匯入並跑 pipeline)")
        for r in pending:
            tag = "= already in cafes" if r["google_place_id"] in existing_by_pid else "+ will import"
            print(f"  {tag}: {r['name']!r}  ({r['google_place_id']})")
        return

    needs_pipeline, already = _bulk_mark_imported_for_existing(pending, existing_by_pid)
    print(f"\n要跑 pipeline 的有 {len(needs_pipeline)} 筆。\n")

    success = 0
    failed: list[tuple[str, str]] = []  # (rec_id, name)

    for i, rec in enumerate(needs_pipeline, 1):
        print(f"\n[{i}/{len(needs_pipeline)}] === {rec['name']!r}  ({rec['google_place_id']}) ===")
        try:
            cafe_id = _insert_cafe(rec)
        except Exception as exc:
            logger.exception("insert cafe failed for rec=%s", rec["id"])
            failed.append((rec["id"], rec["name"]))
            continue

        ok = _run_pipeline(cafe_id=cafe_id, place_id=rec["google_place_id"])
        if ok:
            _mark_imported(rec["id"], cafe_id)
            success += 1
            print(f"  ✓ done → cafe_id={cafe_id}")
        else:
            # pipeline 沒過,但 cafes 列已經寫進去了 ── 不 rollback,下次重跑時
            # _bulk_mark_imported_for_existing 會把這筆當作「已存在」直接標 imported,
            # 或站長手動跑單一 cafe 的修補 stage。
            failed.append((rec["id"], rec["name"]))
            print(f"  ✗ pipeline failed; cafe row {cafe_id} 保留,推薦留在 pending")

    print(
        f"\n總結:已存在直接標 imported {already} 筆;"
        f"pipeline 成功 {success} 筆;失敗 {len(failed)} 筆。"
    )
    if failed:
        print("\n失敗清單(留在 pending,下次重跑):")
        for rec_id, name in failed:
            print(f"  - {name!r}  ({rec_id})")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    ap = argparse.ArgumentParser(description="批次匯入使用者推薦的咖啡廳到 cafes + 跑 pipeline")
    ap.add_argument("--apply", action="store_true", help="實際匯入(不加就只 dry-run)")
    ap.add_argument("--limit", type=int, default=None, help="一次最多處理幾筆(預設全部)")
    args = ap.parse_args()

    try:
        run(apply=args.apply, limit=args.limit)
    except KeyboardInterrupt:
        print("\n中斷。", file=sys.stderr)


if __name__ == "__main__":
    main()
