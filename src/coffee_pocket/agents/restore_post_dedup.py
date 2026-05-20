"""Post-dedup recovery: undo bad overwrites + bring back lost cafes.

Background
----------
``restore_dedup_cafe_nomad --apply`` ran ``cafenomad.upsert_cafes`` to
re-attach Coffee Nomad payloads to 11 canonical cafes. Side effect: that
upsert overwrites ``name``/``address``/``location`` with the Cafe Nomad
values, clobbering the (correct) Google-resolved values that were there.

Separately, 14 ``duplicate_of`` rows had their canonicals *also* deleted
(mutual-dup loops or chains ending in a not_found row), so re-importing
the dup's payload had nowhere to land. We need to insert them as fresh
rows.

This script does both, idempotently:

A. **Revert** — for every canonical cafe whose ``cafe_nomad_id`` matches
   a dup row from the backup, call Place Details on its existing
   ``google_place_id`` and write Google's displayName/formattedAddress/
   location back.

B. **Reinsert** — for every dup row in the backup whose chain dead-ends
   in a deleted row, fetch the matching Cafe Nomad record from the API
   and insert a fresh ``cafes`` + ``reviews_raw`` pair.

C. **Semantic** — run ``semantic.process_cafe`` on the newly-inserted
   cafes so ``cafe_tags`` + ``tag_evidence`` get populated.

Usage:
    uv run python -m coffee_pocket.agents.restore_post_dedup              # dry-run
    uv run python -m coffee_pocket.agents.restore_post_dedup --apply      # write
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import Any

from ..db import get_client
from .cafenomad import fetch_tainan_cafes, map_to_raw_signals
from .places_lookup import get_place_details
from .semantic import process_cafe

logger = logging.getLogger(__name__)

BACKUP_PATH = Path("data/audit/deleted_cafes_backup.json")


def _load_backup() -> list[dict[str, Any]]:
    if not BACKUP_PATH.exists():
        print(f"找不到備份 {BACKUP_PATH}", file=sys.stderr)
        sys.exit(1)
    return json.loads(BACKUP_PATH.read_text())


def _resolve_canonical(start_id: str, backup_by_id: dict[str, dict[str, Any]], live_ids: set[str]) -> str | None:
    seen: set[str] = set()
    cur = start_id
    while cur and cur not in seen:
        seen.add(cur)
        if cur in live_ids:
            return cur
        rec = backup_by_id.get(cur)
        if not rec:
            return None
        cur = rec.get("duplicate_of")
    return None


def step_revert(db: Any, apply: bool, sleep_ms: int) -> None:
    """Restore name/address/location for canonicals whose cafe_nomad_id
    matches a backup dup row (i.e. the ones touched by restore_dedup_cafe_nomad).
    """
    backup = _load_backup()
    dup_cn_ids = [r["cafe_nomad_id"] for r in backup if r.get("duplicate_of") and r.get("cafe_nomad_id")]
    rows = (
        db.table("cafes")
        .select("id, name, address, google_place_id, cafe_nomad_id")
        .in_("cafe_nomad_id", dup_cn_ids)
        .execute()
        .data
        or []
    )
    print(f"  找到 {len(rows)} 筆需要還原的 canonical")
    fixed = 0
    for r in rows:
        pid = r.get("google_place_id")
        if not pid:
            print(f"    ⚠ 跳過 (沒有 google_place_id): {r['name']!r}")
            continue
        details = get_place_details(pid)
        if not details:
            print(f"    ⚠ 跳過 (Place Details 失敗): {r['name']!r}")
            continue
        new_name = (details.get("displayName") or {}).get("text")
        new_addr = details.get("formattedAddress")
        loc = details.get("location") or {}
        lat, lon = loc.get("latitude"), loc.get("longitude")
        payload: dict[str, Any] = {}
        if new_name and new_name != r.get("name"):
            payload["name"] = new_name
        if new_addr and new_addr != r.get("address"):
            payload["address"] = new_addr
        if lat is not None and lon is not None:
            payload["location"] = f"SRID=4326;POINT({float(lon)} {float(lat)})"
        if not payload:
            print(f"    = 無變化: {r['name']!r}")
            continue
        changes = ", ".join(f"{k}={v!r}" for k, v in payload.items() if k != "location")
        if "location" in payload:
            changes += ", location=updated"
        print(f"    ↻ {r['name']!r} → {new_name!r}  [{changes}]")
        if apply:
            db.table("cafes").update(payload).eq("id", r["id"]).execute()
            fixed += 1
        if sleep_ms:
            time.sleep(sleep_ms / 1000)
    if apply:
        print(f"  ✓ 還原 {fixed} 筆")


def step_reinsert(db: Any, apply: bool) -> list[str]:
    """Re-insert the 14 cafes whose chains dead-ended. Returns inserted cafe ids."""
    backup = _load_backup()
    backup_by_id = {r["id"]: r for r in backup}
    dup_rows = [r for r in backup if r.get("duplicate_of") and r.get("cafe_nomad_id")]

    live_rows = db.table("cafes").select("id").execute().data or []
    live_ids = {r["id"] for r in live_rows}

    lost_cn_ids: list[str] = []
    lost_names: dict[str, str] = {}
    for r in dup_rows:
        if _resolve_canonical(r["duplicate_of"], backup_by_id, live_ids) is None:
            lost_cn_ids.append(r["cafe_nomad_id"])
            lost_names[r["cafe_nomad_id"]] = r["name"]

    # paranoia: skip cn_ids that already exist
    if lost_cn_ids:
        existing = (
            db.table("cafes")
            .select("cafe_nomad_id")
            .in_("cafe_nomad_id", lost_cn_ids)
            .execute()
            .data
            or []
        )
        already = {r["cafe_nomad_id"] for r in existing if r.get("cafe_nomad_id")}
        if already:
            print(f"  ⚠ 這些 cn_id 已經存在於 DB，跳過: {already}")
            lost_cn_ids = [c for c in lost_cn_ids if c not in already]

    print(f"  要重灌的 cn_ids: {len(lost_cn_ids)}")
    if not lost_cn_ids:
        return []

    print(f"  抓 Cafe Nomad API…")
    items = fetch_tainan_cafes()
    target_set = set(lost_cn_ids)
    subset = [it for it in items if it.get("id") in target_set]
    print(f"  目標 {len(lost_cn_ids)} 筆 → API 找到 {len(subset)} 筆")
    missing = target_set - {it.get("id") for it in subset}
    if missing:
        for cn in missing:
            print(f"    ⚠ Cafe Nomad API 已找不到: {cn} ({lost_names.get(cn, '?')})")

    if not subset:
        return []

    for it in subset:
        print(f"    + {it.get('name')!r}  cn={it.get('id')}")

    if not apply:
        return []

    cafe_rows = []
    for it in subset:
        lat, lon = it.get("latitude"), it.get("longitude")
        if lat is None or lon is None:
            print(f"    ⚠ 跳過 (缺座標): {it.get('name')!r}")
            continue
        cafe_rows.append(
            {
                "name": it.get("name") or "(unknown)",
                "address": it.get("address"),
                "cafe_nomad_id": it["id"],
                "location": f"SRID=4326;POINT({float(lon)} {float(lat)})",
            }
        )
    if not cafe_rows:
        return []

    inserted = db.table("cafes").insert(cafe_rows).execute().data or []
    print(f"  ✓ 寫入 cafes: {len(inserted)}")

    id_map = {r["cafe_nomad_id"]: r["id"] for r in inserted}
    raw_rows = []
    for it in subset:
        cafe_uuid = id_map.get(it["id"])
        if not cafe_uuid:
            continue
        signals = map_to_raw_signals(it)
        raw_rows.append(
            {
                "cafe_id": cafe_uuid,
                "source_id": "cafe_nomad",
                "external_id": it["id"],
                "text": f"Cafe Nomad record: {it.get('name', '')}",
                "extracted_signals": {"raw": it, "signals": signals},
            }
        )
    if raw_rows:
        db.table("reviews_raw").upsert(raw_rows, on_conflict="source_id,external_id").execute()
        print(f"  ✓ 寫入 reviews_raw: {len(raw_rows)}")

    return list(id_map.values())


def step_semantic(cafe_ids: list[str]) -> None:
    if not cafe_ids:
        print("  沒有 cafe 需要處理。")
        return
    total_tags = 0
    for cid in cafe_ids:
        stats = process_cafe(cid)
        total_tags += stats["tags"]
        print(f"  {cid} → tags={stats['tags']}")
    print(f"  ✓ 共寫入 {total_tags} 個 cafe_tags（加 tag_evidence）")


def run(*, apply: bool, sleep_ms: int, skip_revert: bool, skip_reinsert: bool) -> None:
    db = get_client()

    if not skip_revert:
        print("=== Step A: 還原 11 筆 canonical 的 Google name/address/location ===")
        step_revert(db, apply, sleep_ms)
    else:
        print("=== Step A: 跳過 ===")

    new_ids: list[str] = []
    if not skip_reinsert:
        print("\n=== Step B: 重新插入 14 筆原本被刪光的 cafe ===")
        new_ids = step_reinsert(db, apply)
    else:
        print("\n=== Step B: 跳過 ===")

    if apply and new_ids:
        print(f"\n=== Step C: 跑 Semantic Agent 補 cafe_tags + tag_evidence ({len(new_ids)} 筆) ===")
        step_semantic(new_ids)
    elif not apply:
        print("\n(dry-run; 加 --apply 才會寫入)")


def main() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser(description="還原被 cafenomad 覆寫的 11 筆 + 重灌被刪光的 14 筆")
    ap.add_argument("--apply", action="store_true", help="實際寫入 DB")
    ap.add_argument("--sleep-ms", type=int, default=100, help="Place Details 之間 sleep")
    ap.add_argument("--skip-revert", action="store_true", help="跳過 Step A（還原 11 筆）")
    ap.add_argument("--skip-reinsert", action="store_true", help="跳過 Step B+C（重灌 14 筆 + semantic）")
    args = ap.parse_args()
    try:
        run(apply=args.apply, sleep_ms=args.sleep_ms, skip_revert=args.skip_revert, skip_reinsert=args.skip_reinsert)
    except KeyboardInterrupt:
        print("\n中斷。", file=sys.stderr)


if __name__ == "__main__":
    main()
