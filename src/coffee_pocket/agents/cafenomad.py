"""CafeNomad Agent — fetch Tainan cafes, map to Raw Signals, upsert into Supabase.

Mapping per specs/AGENTS.md §2.1. No LLM; pure field mapping.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..db import get_client

CAFE_NOMAD_URL = "https://cafenomad.tw/api/v1.2/cafes/tainan"

logger = logging.getLogger(__name__)


def _to_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _socket_to_raw(value: str | None) -> bool | str | None:
    """Cafe Nomad `socket` → Raw Signal `socket_available`.
    yes → True, no → False, maybe → 'partial', else None.
    """
    if value == "yes":
        return True
    if value == "no":
        return False
    if value == "maybe":
        return "partial"
    return None


def _limited_time_to_status(value: str | None) -> str | None:
    """Cafe Nomad `limited_time` → time_limit.status."""
    return {"yes": "limited", "maybe": "conditional", "no": "unlimited"}.get(value or "")


def map_to_raw_signals(item: dict[str, Any]) -> dict[str, Any]:
    """Cafe Nomad record → Raw Signals dict (per AGENTS.md §2.1)."""
    return {
        "socket_available": _socket_to_raw(item.get("socket")),
        "noise_level": _to_int(item.get("quiet")),
        "seating_availability": _to_int(item.get("seat")),
        "wifi_quality": _to_int(item.get("wifi")),
        "time_limit": {"status": _limited_time_to_status(item.get("limited_time"))},
        "business_hours_raw": item.get("open_time"),
        "tasty": _to_int(item.get("tasty")),
        "cheap": _to_int(item.get("cheap")),
    }


def fetch_tainan_cafes() -> list[dict[str, Any]]:
    with httpx.Client(timeout=30) as client:
        resp = client.get(CAFE_NOMAD_URL)
        resp.raise_for_status()
        return resp.json()


def upsert_cafes(items: list[dict[str, Any]]) -> tuple[int, int]:
    """Upsert into `cafes` keyed by cafe_nomad_id, then stash raw payload + signals
    into `reviews_raw` with source_id='cafe_nomad' (the Semantic Agent will
    consume from there).

    Returns (cafes_upserted, raw_upserted).
    """
    db = get_client()

    cafe_rows: list[dict[str, Any]] = []
    for item in items:
        cn_id = item.get("id")
        if not cn_id:
            continue
        lat, lon = item.get("latitude"), item.get("longitude")
        if lat is None or lon is None:
            continue
        cafe_rows.append(
            {
                "name": item.get("name") or "(unknown)",
                "address": item.get("address"),
                "cafe_nomad_id": cn_id,
                # PostGIS geography accepts EWKT text
                "location": f"SRID=4326;POINT({float(lon)} {float(lat)})",
            }
        )

    if not cafe_rows:
        return (0, 0)

    # Upsert cafes by cafe_nomad_id (unique).
    db.table("cafes").upsert(cafe_rows, on_conflict="cafe_nomad_id").execute()

    # Re-read so we can map cafe_nomad_id -> cafes.id for reviews_raw FK.
    cn_ids = [r["cafe_nomad_id"] for r in cafe_rows]
    id_map: dict[str, str] = {}
    # chunk the IN-list to keep URL length sane
    CHUNK = 200
    for i in range(0, len(cn_ids), CHUNK):
        sub = cn_ids[i : i + CHUNK]
        rows = (
            db.table("cafes")
            .select("id, cafe_nomad_id")
            .in_("cafe_nomad_id", sub)
            .execute()
            .data
        )
        for r in rows:
            id_map[r["cafe_nomad_id"]] = r["id"]

    raw_rows: list[dict[str, Any]] = []
    for item in items:
        cn_id = item.get("id")
        cafe_uuid = id_map.get(cn_id)
        if not cafe_uuid:
            continue
        signals = map_to_raw_signals(item)
        raw_rows.append(
            {
                "cafe_id": cafe_uuid,
                "source_id": "cafe_nomad",
                "external_id": cn_id,
                "text": f"Cafe Nomad record: {item.get('name', '')}",
                "extracted_signals": {"raw": item, "signals": signals},
            }
        )

    if raw_rows:
        for i in range(0, len(raw_rows), 200):
            db.table("reviews_raw").upsert(
                raw_rows[i : i + 200], on_conflict="source_id,external_id"
            ).execute()

    return (len(cafe_rows), len(raw_rows))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logger.info("Fetching Cafe Nomad Tainan list…")
    items = fetch_tainan_cafes()
    logger.info("Fetched %d records", len(items))
    cafes_n, raw_n = upsert_cafes(items)
    logger.info("Upserted cafes=%d, reviews_raw=%d", cafes_n, raw_n)


if __name__ == "__main__":
    main()
