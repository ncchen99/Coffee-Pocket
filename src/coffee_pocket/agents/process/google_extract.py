"""Google reviews extractor — reads local scraped JSON, upserts reviews_raw,
runs LLM signal extraction.

Pipeline:
  1. Scan data/reviews/*.json (produced by google_scraper).
  2. For each cafe's reviews: upsert into reviews_raw (source_id='google_places').
  3. Chunk reviews (≤ CHUNK_SIZE) → OpenAI (gpt-4o-mini) JSON extraction.
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
    Signal,
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
                "_row": r,
            }
        )
    return result


def write_dead_letter(payload: Any, error: str) -> None:
    db = get_client()
    db.table("dead_letter").insert(
        {"source_id": "google_places", "payload": payload, "error": error}
    ).execute()


def mark_processed(
    processed: list[dict[str, Any]],
    signals_by_review: dict[str, list[dict]],
) -> None:
    """Batch-upsert processed_at + extracted_signals.

    Each item must carry the original full row under `_row` so the INSERT
    branch of upsert can satisfy NOT NULL constraints; conflict resolves
    on (source_id, external_id) and updates in place.
    """
    if not processed:
        return
    db = get_client()
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            **item["_row"],
            "processed_at": now,
            "extracted_signals": signals_by_review.get(item["id"], []),
        }
        for item in processed
    ]
    db.table("reviews_raw").upsert(rows, on_conflict="source_id,external_id").execute()


def extract_chunk(
    chunk: list[dict[str, str]],
) -> tuple[ExtractionResult, list[dict[str, Any]]]:
    """Run LLM on a chunk; validate signals one-by-one.

    Returns (result_with_valid_signals, bad_signal_records). The LLM
    occasionally hallucinates non-literal values (e.g. polarity='false'),
    which would otherwise reject the whole chunk and drop every other
    valid signal in it. Per-signal validation keeps the good ones.
    """
    raw = chat_json(SYSTEM_PROMPT, json.dumps({"reviews": chunk}, ensure_ascii=False))
    if not isinstance(raw, dict):
        raise ValidationError.from_exception_data(  # type: ignore[arg-type]
            "ExtractionResult", [{"type": "dict_type", "loc": (), "input": raw}]
        )

    raw_signals = raw.get("signals") or []
    if not isinstance(raw_signals, list):
        raise ValueError(f"LLM returned non-list signals: {type(raw_signals).__name__}")

    valid: list[Signal] = []
    bad: list[dict[str, Any]] = []
    for idx, item in enumerate(raw_signals):
        try:
            valid.append(Signal.model_validate(item))
        except ValidationError as exc:
            bad.append({"index": idx, "raw": item, "error": str(exc)})
    return ExtractionResult(signals=valid), bad


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
    processed_items: list[dict[str, Any]] = []
    by_id = {r["id"]: r for r in todo}
    total_signals = 0

    for idx, chunk in enumerate(chunks):
        if idx > 0:
            time.sleep(1.5)
        try:
            result, bad_signals = extract_chunk(chunk)
        except (LLMError, ValidationError, ValueError) as exc:
            # Whole-chunk failure: LLM call errored or returned unparseable
            # JSON. Leave reviews with processed_at=NULL so a re-run retries.
            logger.warning("  LLM chunk failed: %s", exc)
            write_dead_letter({"cafe_id": cafe_id, "chunk": chunk}, str(exc))
            continue
        if bad_signals:
            # Partial failure: some signals were invalid but the rest are
            # usable. Record the bad ones for visibility, keep the chunk's
            # reviews marked processed (no infinite retry on hallucinations).
            logger.warning(
                "  LLM chunk had %d invalid signal(s); kept %d valid",
                len(bad_signals),
                len(result.signals),
            )
            write_dead_letter(
                {"cafe_id": cafe_id, "chunk": chunk, "bad_signals": bad_signals},
                f"{len(bad_signals)} invalid signals dropped",
            )
        for sig in result.signals:
            total_signals += 1
            if sig.review_id and sig.review_id in signals_by_review:
                signals_by_review[sig.review_id].append(sig.model_dump())
        processed_items.extend(by_id[item["id"]] for item in chunk)

    mark_processed(processed_items, signals_by_review)
    logger.info("  → %d signals extracted across %d reviews", total_signals, len(processed_items))
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
