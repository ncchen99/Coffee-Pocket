"""Insert a hand-curated list of cafes (name + address) into the cafes table.

For each entry we call the Places API ``find_place`` to resolve name+address
into a ``place_id``, ``displayName``, ``location``, and ``googleMapsUri``,
then upsert keyed by ``google_place_id``. Rows that don't resolve are
reported and skipped so the user can fix the address.

The list below was extracted from ``data/ig/greenyaya.314.txt`` (2026-05).

Usage:
    uv run python -m coffee_pocket.agents.insert_manual_cafes               # dry-run
    uv run python -m coffee_pocket.agents.insert_manual_cafes --apply       # write to DB
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from typing import Any

from ..db import get_client
from .places_lookup import find_place

logger = logging.getLogger(__name__)

# (name, address)
CAFES: list[tuple[str, str]] = [
    ("B.b.cafe",            "台南市中西區民權路二段48號2樓"),
    ("古意人咖啡",            "台南市中西區南門路227巷11號"),
    ("双仔咖啡",             "台南市中西區南門路189號"),
    ("Holi cafe 外帶吧",     "台南市中西區大德街1號"),
    ("獨善",                "台南市中西區新美街183號"),
    ("欽欽珈琲",             "台南市中西區神農街32號"),
    ("Coffee Nonstop 不停咖啡室", "台南市東區東和路9號1樓"),
    ("珈琲人間",             "台南市東區裕豐街84巷6號"),
    ("稲満珈琲",             "台南市北區南園街49巷51號"),
    ("咖啡酌客",             "台南市南區西門路一段597巷10號"),
    ("在古董咖啡",           "台南市南區體育路41巷30之1號"),
    ("和平咖",              "台南市南區鹽埕路128號"),
    ("EAE coffee",          "台南市南區夏林路250號"),
    ("過去珈琲",             "台南市大內區2-12號"),
    ("與山咖啡",             "台南市鹽水區中正路37號之6"),
    ("小啡巷",              "台南市仁德區林頂街1之7號1樓"),
]


def _resolve(name: str, address: str) -> dict[str, Any] | None:
    place = find_place(name, address)
    if not place:
        return None
    loc = place.get("location") or {}
    lat, lon = loc.get("latitude"), loc.get("longitude")
    if lat is None or lon is None:
        return None
    return {
        "name": (place.get("displayName") or {}).get("text") or name,
        "address": place.get("formattedAddress") or address,
        "google_place_id": place.get("id"),
        "google_maps_url": place.get("googleMapsUri"),
        "location": f"SRID=4326;POINT({float(lon)} {float(lat)})",
    }


def run(*, apply: bool, sleep_ms: int) -> None:
    db = get_client()

    # Check what's already in the DB so we don't double-insert.
    existing = (
        db.table("cafes")
        .select("id, name, google_place_id")
        .execute()
        .data
        or []
    )
    existing_pids = {r["google_place_id"] for r in existing if r.get("google_place_id")}

    rows: list[dict[str, Any]] = []
    skipped: list[tuple[str, str, str]] = []  # (name, address, reason)

    print(f"Resolving {len(CAFES)} cafes via Places API...\n")
    for i, (name, address) in enumerate(CAFES, 1):
        resolved = _resolve(name, address)
        if not resolved:
            print(f"  [{i}/{len(CAFES)}] ✗ unresolved: {name!r}  ({address})")
            skipped.append((name, address, "not_found"))
            if sleep_ms:
                time.sleep(sleep_ms / 1000)
            continue
        if resolved["google_place_id"] in existing_pids:
            print(f"  [{i}/{len(CAFES)}] = already in DB: {name!r} → {resolved['name']!r}")
            skipped.append((name, address, "duplicate"))
            if sleep_ms:
                time.sleep(sleep_ms / 1000)
            continue
        print(f"  [{i}/{len(CAFES)}] ✓ {name!r} → {resolved['name']!r}  ({resolved['google_place_id']})")
        rows.append(resolved)
        existing_pids.add(resolved["google_place_id"])  # guard against intra-batch dupes
        if sleep_ms:
            time.sleep(sleep_ms / 1000)

    print(f"\n要寫入 {len(rows)} 筆；跳過 {len(skipped)} 筆。")
    if not apply:
        print("(dry-run; 加 --apply 寫入)")
        return
    if not rows:
        return

    # Upsert by google_place_id so re-runs are idempotent.
    db.table("cafes").upsert(rows, on_conflict="google_place_id").execute()
    print(f"已寫入 {len(rows)} 筆。")


def main() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser(description="把手選的咖啡廳清單加進 cafes 表")
    ap.add_argument("--apply", action="store_true", help="實際寫入 DB（不加就只 dry-run）")
    ap.add_argument("--sleep-ms", type=int, default=80, help="每次 API call 之間 sleep")
    args = ap.parse_args()

    try:
        run(apply=args.apply, sleep_ms=args.sleep_ms)
    except KeyboardInterrupt:
        print("\n中斷。", file=sys.stderr)


if __name__ == "__main__":
    main()
