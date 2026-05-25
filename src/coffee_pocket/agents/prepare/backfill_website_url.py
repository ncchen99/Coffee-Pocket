"""Backfill cafes.website_url from scraped review JSON.

Reads every ``data/reviews/*.json`` produced by the Google scraper and copies
``meta.website`` into ``cafes.website_url`` (matched by ``google_place_id``).

Only this single column is touched — nothing else on the row is modified.
Rows whose ``website_url`` already matches are skipped.

Usage:
    uv run python -m coffee_pocket.agents.prepare.backfill_website_url            # dry-run
    uv run python -m coffee_pocket.agents.prepare.backfill_website_url --apply    # write
    uv run python -m coffee_pocket.agents.prepare.backfill_website_url --limit 5  # peek a few
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from ...db import get_client

logger = logging.getLogger(__name__)

REVIEWS_DIR = Path(__file__).resolve().parents[4] / "data" / "reviews"


def _iter_json(limit: int | None) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for path in sorted(REVIEWS_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("skip %s: %s", path.name, exc)
            continue
        place_id = data.get("place_id")
        website = (data.get("meta") or {}).get("website")
        if not place_id or not website:
            continue
        pairs.append((place_id, website.strip()))
        if limit and len(pairs) >= limit:
            break
    return pairs


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="actually write to Supabase")
    parser.add_argument("--limit", type=int, default=None, help="process at most N files")
    args = parser.parse_args()

    if not REVIEWS_DIR.exists():
        logger.error("reviews dir not found: %s", REVIEWS_DIR)
        return 1

    pairs = _iter_json(args.limit)
    logger.info("scanned reviews: %d with place_id+website", len(pairs))

    client = get_client()

    place_ids = [p for p, _ in pairs]
    existing: dict[str, tuple[str, str | None]] = {}
    chunk = 200
    for i in range(0, len(place_ids), chunk):
        resp = (
            client.table("cafes")
            .select("id,google_place_id,website_url")
            .in_("google_place_id", place_ids[i : i + chunk])
            .execute()
        )
        for row in resp.data or []:
            existing[row["google_place_id"]] = (row["id"], row.get("website_url"))

    to_update: list[tuple[str, str, str | None, str]] = []  # (cafe_id, place_id, old, new)
    no_match = 0
    unchanged = 0
    for place_id, website in pairs:
        match = existing.get(place_id)
        if not match:
            no_match += 1
            continue
        cafe_id, current = match
        if current == website:
            unchanged += 1
            continue
        to_update.append((cafe_id, place_id, current, website))

    logger.info(
        "no DB match: %d   already current: %d   to update: %d",
        no_match,
        unchanged,
        len(to_update),
    )

    for cafe_id, place_id, old, new in to_update[:20]:
        logger.info("  %s  %s  ->  %s", place_id, old or "(null)", new)
    if len(to_update) > 20:
        logger.info("  ... %d more", len(to_update) - 20)

    if not args.apply:
        logger.info("dry-run; pass --apply to write")
        return 0

    written = 0
    for cafe_id, _place_id, _old, new in to_update:
        client.table("cafes").update({"website_url": new}).eq("id", cafe_id).execute()
        written += 1
    logger.info("updated %d rows", written)
    return 0


if __name__ == "__main__":
    sys.exit(main())
