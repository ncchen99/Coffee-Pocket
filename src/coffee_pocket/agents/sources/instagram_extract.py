"""Instagram text extractor — imports local post text and runs LLM extraction.

The input is a manually exported text post, usually containing multiple cafes.
Each cafe block is matched to an existing `cafes` row by address or name, then
stored as `reviews_raw(source_id='instagram')` so the Semantic Agent can merge
it with Google Places and Cafe Nomad data.

Usage:
  uv run python -m coffee_pocket.agents.sources.instagram_extract --file data/ig/greenyaya.314.txt --dry-run
  uv run python -m coffee_pocket.agents.sources.instagram_extract --file data/ig/greenyaya.314.txt
  uv run python -m coffee_pocket.agents.sources.instagram_extract --no-llm
  uv run python -m coffee_pocket.agents.sources.instagram_extract --reprocess
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from ...db import get_client
from ...llm import LLMError, chat_json
from ..process.google_places import CHUNK_SIZE, SYSTEM_PROMPT, ExtractionResult, Signal

logger = logging.getLogger(__name__)

IG_DIR = Path("data/ig")
ENTRY_MARKERS = "➊➋➌➍➎➏➐➑➒➓"


def _norm(value: str | None) -> str:
    if not value:
        return ""
    value = value.replace("臺", "台")
    value = re.sub(r"^\s*\d{3}", "", value)
    value = re.sub(r"\s+", "", value.lower())
    return re.sub(r"[()（）【】\\[\\]。.,，、!！?？:：;；｜|／/\\-＿_]", "", value)


def _clean_name(line: str) -> str:
    line = line.strip()
    line = re.sub(rf"^[{ENTRY_MARKERS}]\s*", "", line)
    line = re.sub(r"（.*?）", "", line)
    line = re.sub(r"\(.*?\)", "", line)
    return line.strip()


def _extract_address(text: str) -> str | None:
    match = re.search(r"⭑地址\s*[│|]\s*(.+)", text)
    if not match:
        return None
    return match.group(1).strip()


def parse_post_text(text: str) -> list[dict[str, str]]:
    """Split one Instagram post text into cafe-sized blocks."""
    entries: list[dict[str, str]] = []
    current_name: str | None = None
    current_lines: list[str] = []

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        is_entry_start = bool(stripped) and stripped[0] in ENTRY_MARKERS

        if is_entry_start:
            if current_name and current_lines:
                block = "\n".join(current_lines).strip()
                entries.append(
                    {
                        "name": current_name,
                        "address": _extract_address(block) or "",
                        "text": block,
                    }
                )
            current_name = _clean_name(stripped)
            current_lines = [stripped]
            continue

        if current_name:
            current_lines.append(line)

    if current_name and current_lines:
        block = "\n".join(current_lines).strip()
        entries.append(
            {
                "name": current_name,
                "address": _extract_address(block) or "",
                "text": block,
            }
        )

    return entries


def fetch_cafes() -> list[dict[str, Any]]:
    db = get_client()
    return db.table("cafes").select("id, name, address").execute().data


def match_cafe(entry: dict[str, str], cafes: list[dict[str, Any]]) -> dict[str, Any] | None:
    name = _norm(entry.get("name"))
    address = _norm(entry.get("address"))

    exact_name = [c for c in cafes if _norm(c.get("name")) == name]
    if len(exact_name) == 1:
        return exact_name[0]

    contains_name = [
        c
        for c in cafes
        if len(name) >= 3 and (name in _norm(c.get("name")) or _norm(c.get("name")) in name)
    ]
    if len(contains_name) == 1:
        return contains_name[0]

    if address:
        exact_address = [c for c in cafes if _norm(c.get("address")) == address]
        if len(exact_address) == 1:
            return exact_address[0]
        if len(exact_address) > 1:
            named = [
                c
                for c in exact_address
                if name and (name in _norm(c.get("name")) or _norm(c.get("name")) in name)
            ]
            if len(named) == 1:
                return named[0]

        contains_address = [
            c
            for c in cafes
            if _norm(c.get("address"))
            and (address in _norm(c.get("address")) or _norm(c.get("address")) in address)
        ]
        if len(contains_address) == 1:
            return contains_address[0]
        if len(contains_address) > 1:
            named = [
                c
                for c in contains_address
                if name and (name in _norm(c.get("name")) or _norm(c.get("name")) in name)
            ]
            if len(named) == 1:
                return named[0]

    return None


def _external_id(path: Path, entry: dict[str, str]) -> str:
    raw = f"{path.stem}:{entry.get('name','')}:{entry.get('address','')}:{entry.get('text','')}"
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
    return f"{path.stem}:{digest}"


def upsert_entries(path: Path, entries: list[dict[str, str]]) -> list[dict[str, Any]]:
    """Match and upsert Instagram entries. Returns rows ready for LLM."""
    cafes = fetch_cafes()
    rows: list[dict[str, Any]] = []
    unmatched: list[str] = []

    for entry in entries:
        cafe = match_cafe(entry, cafes)
        if not cafe:
            unmatched.append(f"{entry['name']} | {entry.get('address') or 'no address'}")
            continue
        rows.append(
            {
                "cafe_id": cafe["id"],
                "source_id": "instagram",
                "external_id": _external_id(path, entry),
                "author": path.stem.split(".")[0],
                "text": entry["text"],
            }
        )

    if unmatched:
        logger.warning("Unmatched Instagram cafe blocks: %d", len(unmatched))
        for item in unmatched[:20]:
            logger.warning("  unmatched: %s", item)

    if not rows:
        return []

    db = get_client()
    db.table("reviews_raw").upsert(rows, on_conflict="source_id,external_id").execute()

    ext_ids = [r["external_id"] for r in rows]
    fetched = (
        db.table("reviews_raw")
        .select("id, cafe_id, external_id, text, processed_at")
        .eq("source_id", "instagram")
        .in_("external_id", ext_ids)
        .execute()
        .data
    )
    by_ext = {r["external_id"]: r for r in fetched}
    return [by_ext[r["external_id"]] for r in rows if r["external_id"] in by_ext]


def preview_matches(entries: list[dict[str, str]]) -> dict[str, int]:
    cafes = fetch_cafes()
    matched = 0
    for entry in entries:
        cafe = match_cafe(entry, cafes)
        if cafe:
            matched += 1
            logger.info("match: %s → %s", entry["name"], cafe["name"])
        else:
            logger.warning("unmatched: %s | %s", entry["name"], entry.get("address") or "no address")
    return {"matched": matched, "unmatched": len(entries) - matched}


def write_dead_letter(payload: Any, error: str) -> None:
    db = get_client()
    db.table("dead_letter").insert(
        {"source_id": "instagram", "payload": payload, "error": error}
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


def extract_chunk(
    chunk: list[dict[str, str]],
) -> tuple[ExtractionResult, list[dict[str, Any]]]:
    """Run LLM on a chunk; validate signals one-by-one.

    Mirrors the per-signal tolerance in google_extract.extract_chunk so a
    single hallucinated signal (e.g. polarity='false') does not nuke the
    rest of the chunk's valid output. Returns (result, bad_signal_records).
    """
    raw = chat_json(
        SYSTEM_PROMPT,
        json.dumps({"source": "instagram", "reviews": chunk}, ensure_ascii=False),
    )
    if not isinstance(raw, dict):
        raise ValueError(f"LLM returned non-dict payload: {type(raw).__name__}")

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


def process_file(
    path: Path, *, run_llm: bool, only_unprocessed: bool, dry_run: bool = False
) -> dict[str, int]:
    text = path.read_text(encoding="utf-8")
    entries = parse_post_text(text)
    logger.info("%s → %d cafe block(s) parsed", path.name, len(entries))

    if dry_run:
        preview = preview_matches(entries)
        return {
            "blocks": len(entries),
            "matched": preview["matched"],
            "signals": 0,
        }

    upserted = upsert_entries(path, entries)
    logger.info("%s → %d matched row(s) upserted", path.name, len(upserted))
    if not run_llm or not upserted:
        return {"blocks": len(entries), "matched": len(upserted), "signals": 0}

    todo = [r for r in upserted if (not only_unprocessed) or r.get("processed_at") is None]
    if not todo:
        logger.info("all Instagram rows already processed — skipping LLM")
        return {"blocks": len(entries), "matched": len(upserted), "signals": 0}

    items = [{"id": r["id"], "text": r["text"]} for r in todo]
    chunks = [items[i : i + CHUNK_SIZE] for i in range(0, len(items), CHUNK_SIZE)]

    signals_by_review: dict[str, list[dict]] = {r["id"]: [] for r in todo}
    processed_ids: list[str] = []
    total_signals = 0

    for idx, chunk in enumerate(chunks):
        if idx > 0:
            time.sleep(1.5)
        try:
            result, bad_signals = extract_chunk(chunk)
        except (LLMError, ValidationError, ValueError) as exc:
            logger.warning("LLM chunk failed: %s", exc)
            write_dead_letter({"file": str(path), "chunk": chunk}, str(exc))
            continue
        if bad_signals:
            logger.warning(
                "LLM chunk had %d invalid signal(s); kept %d valid",
                len(bad_signals),
                len(result.signals),
            )
            write_dead_letter(
                {"file": str(path), "chunk": chunk, "bad_signals": bad_signals},
                f"{len(bad_signals)} invalid signals dropped",
            )
        for sig in result.signals:
            total_signals += 1
            if sig.review_id and sig.review_id in signals_by_review:
                signals_by_review[sig.review_id].append(sig.model_dump())
        processed_ids.extend(item["id"] for item in chunk)

    mark_processed(processed_ids, signals_by_review)
    logger.info("→ %d signals extracted across %d Instagram row(s)", total_signals, len(processed_ids))
    return {"blocks": len(entries), "matched": len(upserted), "signals": total_signals}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", type=str, default=None, help="process a single .txt file")
    parser.add_argument("--limit", type=int, default=None, help="process N files only")
    parser.add_argument("--dry-run", action="store_true", help="parse and match only; do not write")
    parser.add_argument("--no-llm", action="store_true", help="upsert only; skip LLM extraction")
    parser.add_argument(
        "--reprocess",
        action="store_true",
        help="Re-run LLM even on already-processed Instagram rows",
    )
    args = parser.parse_args()

    if args.file:
        files = [Path(args.file)]
    else:
        files = sorted(IG_DIR.glob("*.txt"))
        if args.limit:
            files = files[: args.limit]

    logger.info("Processing %d Instagram text file(s)", len(files))
    totals = {"files": 0, "blocks": 0, "matched": 0, "signals": 0}
    for path in files:
        try:
            stats = process_file(
                path,
                run_llm=not args.no_llm,
                only_unprocessed=not args.reprocess,
                dry_run=args.dry_run,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed on %s: %s", path, exc)
            continue
        totals["files"] += 1
        totals["blocks"] += stats["blocks"]
        totals["matched"] += stats["matched"]
        totals["signals"] += stats["signals"]

    logger.info("Totals: %s", totals)


if __name__ == "__main__":
    main()
