"""Audit existing cafes.google_place_id assignments against Google.

Some place_ids in the DB were resolved by an older, looser Text Search query
that liked to return "closest plausible cafe" rather than the actual store.
This script re-queries Place Details for every row that has a place_id and
compares Google's current ``displayName`` to our stored ``name``. Low-
similarity matches get written to ``data/audit/suspicious_matches.tsv`` for
human review — nothing is mutated in the DB.

Usage:
    uv run python -m coffee_pocket.agents.maintenance.audit_place_matches
    uv run python -m coffee_pocket.agents.maintenance.audit_place_matches --limit 20
    uv run python -m coffee_pocket.agents.maintenance.audit_place_matches --threshold 0.7
"""

from __future__ import annotations

import argparse
import csv
import logging
import sys
import time
from pathlib import Path
from typing import Any

from ...db import get_client
from ..shared.places_lookup import get_place_details, name_similarity

logger = logging.getLogger(__name__)

OUT_DIR = Path("data/audit")
OUT_FILE = OUT_DIR / "suspicious_matches.tsv"

DEFAULT_THRESHOLD = 0.6


def _row_name(row: dict[str, Any]) -> str:
    return row.get("name") or ""


def _google_name(details: dict[str, Any]) -> str:
    return (details.get("displayName") or {}).get("text") or ""


def audit(limit: int | None, threshold: float, sleep_ms: int) -> None:
    db = get_client()
    rows = (
        db.table("cafes")
        .select("id, name, address, google_place_id, google_maps_url, business_status")
        .not_.is_("google_place_id", "null")
        .execute()
        .data
        or []
    )
    if limit:
        rows = rows[:limit]

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    suspicious: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    print(f"Auditing {len(rows)} rows with place_id (threshold={threshold:.2f})\n")

    for i, row in enumerate(rows, 1):
        details = get_place_details(row["google_place_id"])
        if not details:
            skipped.append({"reason": "details_failed", **row})
            print(f"  [{i}/{len(rows)}] ⚠ details failed: {_row_name(row)}")
            continue

        our_name = _row_name(row)
        their_name = _google_name(details)
        ratio = name_similarity(our_name, their_name)
        status = details.get("businessStatus")

        if ratio >= 0.999:
            mark = "✓"  # identical after normalize
        elif ratio >= threshold:
            mark = "≈"  # close enough
        else:
            mark = "✗"  # suspicious

        print(f"  [{i}/{len(rows)}] {mark} {ratio:.2f}  {our_name!r} ↔ {their_name!r}")

        if mark == "✗" or status in {"CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"}:
            suspicious.append({
                "id": row["id"],
                "our_name": our_name,
                "google_name": their_name,
                "our_address": row.get("address") or "",
                "google_address": details.get("formattedAddress") or "",
                "place_id": row["google_place_id"],
                "google_maps_uri": details.get("googleMapsUri") or "",
                "similarity": f"{ratio:.2f}",
                "google_status": status or "",
                "our_status": row.get("business_status") or "",
            })

        if sleep_ms:
            time.sleep(sleep_ms / 1000)

    if not suspicious:
        print("\n沒有發現可疑配對。")
        return

    with OUT_FILE.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "id", "our_name", "google_name", "our_address", "google_address",
                "place_id", "google_maps_uri", "similarity", "google_status", "our_status",
            ],
            delimiter="\t",
        )
        writer.writeheader()
        writer.writerows(suspicious)

    print(f"\n找到 {len(suspicious)} 筆可疑配對 → {OUT_FILE}")
    print("（請人工檢查；確認是錯配的請手動清空 google_place_id 或標 business_status='not_found'）")
    if skipped:
        print(f"⚠ {len(skipped)} 筆 Place Details 取不到，建議稍後重試。")


def main() -> None:
    logging.basicConfig(
        level=logging.WARNING,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    ap = argparse.ArgumentParser(description="比對 DB 裡的 place_id 對應的 Google 名字是否合理")
    ap.add_argument("--limit", type=int, default=None, help="只跑前 N 筆，方便先試水溫")
    ap.add_argument("--threshold", type=float, default=DEFAULT_THRESHOLD,
                    help=f"相似度低於這個值視為可疑 (default: {DEFAULT_THRESHOLD})")
    ap.add_argument("--sleep-ms", type=int, default=50, help="每次 API call 之間 sleep 多久")
    args = ap.parse_args()

    try:
        audit(args.limit, args.threshold, args.sleep_ms)
    except KeyboardInterrupt:
        print("\n中斷。", file=sys.stderr)


if __name__ == "__main__":
    main()
