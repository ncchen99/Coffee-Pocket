"""Google reviews extractor — reads local scraped JSON, upserts reviews_raw,
runs LLM signal extraction.

Pipeline:
  1. Scan data/reviews/*.json (produced by google_scraper).
  2. For each cafe's reviews: upsert into reviews_raw (source_id='google_places').
  3. Chunk reviews (≤ CHUNK_SIZE) → OpenRouter (Gemini Flash) JSON extraction.
  4. Validate against pydantic schema; failures → dead_letter.
  5. Stamp reviews_raw.processed_at + extracted_signals on success.

This module decouples the network/UI fragility of scraping from the LLM step:
re-running --resume only processes reviews not yet marked processed_at.

Usage:
  uv run python -m coffee_pocket.agents.process.google_extract            # all local JSONs
  uv run python -m coffee_pocket.agents.process.google_extract --limit 3
  uv run python -m coffee_pocket.agents.process.google_extract --no-llm   # just upsert
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from ...db import get_client
from ...llm import LLMError, chat_json
from .google_places import (  # reuse schema + prompt + chunk size
    CHUNK_SIZE,
    SYSTEM_PROMPT,
    ExtractionResult,
)

logger = logging.getLogger(__name__)

REVIEWS_DIR = Path("data/reviews")


def upsert_reviews_from_local(cafe_id: str, reviews: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Upsert reviews into reviews_raw. Returns rows with DB id + text."""
    if not reviews:
        return []
    db = get_client()
    rows = []
    for r in reviews:
        ext = r.get("external_id")
        text = (r.get("text") or "").strip()
        if not ext or not text:
            continue
        rows.append(
            {
                "cafe_id": cafe_id,
                "source_id": "google_places",
                "external_id": ext,
                "author": r.get("author"),
                "rating": r.get("rating"),
                "text": text,
                "posted_at": r.get("posted_at_approx"),
            }
        )
    if not rows:
        return []
    db.table("reviews_raw").upsert(rows, on_conflict="source_id,external_id").execute()

    ext_ids = [r["external_id"] for r in rows]
    fetched = (
        db.table("reviews_raw")
        .select("id, external_id, processed_at")
        .eq("source_id", "google_places")
        .in_("external_id", ext_ids)
        .execute()
        .data
    )
    meta_by_ext = {f["external_id"]: f for f in fetched}
    result = []
    for r in rows:
        meta = meta_by_ext.get(r["external_id"])
        if not meta:
            continue
        result.append(
            {
                "id": meta["id"],
                "external_id": r["external_id"],
                "text": r["text"],
                "processed_at": meta.get("processed_at"),
            }
        )
    return result


def write_dead_letter(payload: Any, error: str) -> None:
    db = get_client()
    db.table("dead_letter").insert(
        {"source_id": "google_places", "payload": payload, "error": error}
    ).execute()


def mark_processed(review_ids: list[str], signals_by_review: dict[str, list[dict]]) -> None:
    if not review_ids:
        return
    db = get_client()
    now = datetime.now(timezone.utc).isoformat()
    for rid in review_ids:
        db.table("reviews_raw").update(
            {"processed_at": now, "extracted_signals": signals_by_review.get(rid, [])}
        ).eq("id", rid).execute()


def extract_chunk(chunk: list[dict[str, str]]) -> ExtractionResult:
    raw = chat_json(SYSTEM_PROMPT, json.dumps({"reviews": chunk}, ensure_ascii=False))
    return ExtractionResult.model_validate(raw)


def process_file(path: Path, *, run_llm: bool, only_unprocessed: bool) -> dict[str, int]:
    blob = json.loads(path.read_text(encoding="utf-8"))
    cafe_id = blob.get("cafe_id")
    reviews = blob.get("reviews") or []
    if not cafe_id or not reviews:
        return {"reviews": 0, "signals": 0}

    upserted = upsert_reviews_from_local(cafe_id, reviews)
    logger.info("  %s → %d reviews upserted (cafe_id=%s)", path.name, len(upserted), cafe_id)

    if not run_llm or not upserted:
        return {"reviews": len(upserted), "signals": 0}

    # Filter to those still needing extraction
    todo = [r for r in upserted if (not only_unprocessed) or r["processed_at"] is None]
    if not todo:
        logger.info("  all reviews already processed — skipping LLM")
        return {"reviews": len(upserted), "signals": 0}

    items = [{"id": r["id"], "text": r["text"]} for r in todo]
    chunks = [items[i : i + CHUNK_SIZE] for i in range(0, len(items), CHUNK_SIZE)]

    signals_by_review: dict[str, list[dict]] = {r["id"]: [] for r in todo}
    processed_ids: list[str] = []
    total_signals = 0

    for idx, chunk in enumerate(chunks):
        if idx > 0:
            time.sleep(1.5)
        try:
            result = extract_chunk(chunk)
        except (LLMError, ValidationError) as exc:
            logger.warning("  LLM chunk failed: %s", exc)
            write_dead_letter({"cafe_id": cafe_id, "chunk": chunk}, str(exc))
            continue
        for sig in result.signals:
            total_signals += 1
            if sig.review_id and sig.review_id in signals_by_review:
                signals_by_review[sig.review_id].append(sig.model_dump())
        processed_ids.extend(item["id"] for item in chunk)

    mark_processed(processed_ids, signals_by_review)
    logger.info("  → %d signals extracted across %d reviews", total_signals, len(processed_ids))
    return {"reviews": len(upserted), "signals": total_signals}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="process N files only")
    parser.add_argument("--file", type=str, default=None, help="process a single JSON file")
    parser.add_argument("--no-llm", action="store_true", help="upsert only; skip LLM extraction")
    parser.add_argument(
        "--reprocess",
        action="store_true",
        help="Re-run LLM even on already-processed reviews",
    )
    args = parser.parse_args()

    if args.file:
        files = [Path(args.file)]
    else:
        files = sorted(REVIEWS_DIR.glob("*.json"))
        if args.limit:
            files = files[: args.limit]

    logger.info("Processing %d file(s) from %s", len(files), REVIEWS_DIR)
    totals = {"reviews": 0, "signals": 0, "files": 0}
    for path in files:
        try:
            stats = process_file(
                path,
                run_llm=not args.no_llm,
                only_unprocessed=not args.reprocess,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed on %s: %s", path, exc)
            continue
        totals["files"] += 1
        totals["reviews"] += stats["reviews"]
        totals["signals"] += stats["signals"]

    logger.info("Totals: %s", totals)


if __name__ == "__main__":
    main()
