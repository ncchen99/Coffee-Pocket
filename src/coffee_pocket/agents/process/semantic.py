"""Semantic Agent — aggregate Raw Signals → cafe_tags + tag_evidence.

Reads from reviews_raw (cafe_nomad rows have signals; google_places rows have
signals stamped by the Google Places Agent) and writes the final Semantic
Layer per specs/SPEC.md and specs/AGENTS.md §3.

Tags handled (v1.0):
  - socket_available (boolean)
  - pet_friendly (boolean)
  - reservable (boolean)
  - study_friendly (score 0–100)
  - discussion_friendly (score 0–100)
  - group_chat_friendly (score 0–100)
  - time_limit (structured)
"""

from __future__ import annotations

import argparse
import logging
from collections import defaultdict
from datetime import date
from typing import Any

from ...db import get_client

logger = logging.getLogger(__name__)

# Source priority — higher beats lower (matches sources.priority in DB)
SOURCE_PRIORITY = {
    "community": 100,
    "google_places": 60,
    "instagram": 40,
    "cafe_nomad": 20,
}

# Per-source baseline confidence for evidence pieces
SOURCE_BASE_CONF = {
    "community": 1.0,
    "google_places": 0.8,
    "instagram": 0.7,
    "cafe_nomad": 0.6,
}


def collect_signals(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Normalize raw rows → {tag_key: [{source, polarity/value, text, review_id, conf}, …]}."""
    by_tag: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        sig_blob = row.get("extracted_signals") or {}
        src = row["source_id"]

        if src == "cafe_nomad":
            inner = sig_blob.get("signals") or {}
            socket = inner.get("socket_available")
            if socket is True or socket is False:
                by_tag["socket_available"].append(
                    {
                        "source": src,
                        "polarity": "positive" if socket else "negative",
                        "value": socket,
                        "text": "Cafe Nomad: socket field",
                        "review_id": row["id"],
                        "conf": SOURCE_BASE_CONF[src],
                        "extra": {"raw": socket},
                    }
                )
            time_status = (inner.get("time_limit") or {}).get("status")
            if time_status:
                by_tag["time_limit"].append(
                    {
                        "source": src,
                        "value": {"status": time_status},
                        "text": f"Cafe Nomad limited_time={time_status}",
                        "review_id": row["id"],
                        "conf": SOURCE_BASE_CONF[src],
                        "extra": {},
                    }
                )
            quiet = inner.get("noise_level")
            if isinstance(quiet, int):
                # quiet 4–5 → study positive, 2–3 → discussion positive
                if quiet >= 4:
                    by_tag["study_friendly"].append(
                        {
                            "source": src,
                            "polarity": "positive",
                            "value": 25,
                            "text": f"Cafe Nomad quiet={quiet}",
                            "review_id": row["id"],
                            "conf": SOURCE_BASE_CONF[src],
                            "extra": {"quiet": quiet},
                        }
                    )
                elif quiet <= 3:
                    by_tag["discussion_friendly"].append(
                        {
                            "source": src,
                            "polarity": "positive",
                            "value": 20,
                            "text": f"Cafe Nomad quiet={quiet}",
                            "review_id": row["id"],
                            "conf": SOURCE_BASE_CONF[src],
                            "extra": {"quiet": quiet},
                        }
                    )

        elif src in {"google_places", "instagram"}:
            # extracted_signals here is a list (per-review signals list)
            sigs = sig_blob if isinstance(sig_blob, list) else []
            for s in sigs:
                tag = s.get("type")
                if not tag:
                    continue
                by_tag[tag].append(
                    {
                        "source": src,
                        "polarity": s.get("polarity"),
                        "value": s.get("value"),
                        "text": s.get("evidence"),
                        "review_id": row["id"],
                        "conf": SOURCE_BASE_CONF[src],
                        "extra": {},
                    }
                )
    return by_tag


def aggregate_boolean(
    items: list[dict[str, Any]], *, min_sources: int = 1
) -> dict[str, Any] | None:
    """Boolean tag: majority polarity with configurable source threshold."""
    pos = [i for i in items if i.get("polarity") == "positive"]
    neg = [i for i in items if i.get("polarity") == "negative"]
    distinct = {i["source"] for i in pos} if len(pos) >= len(neg) else {i["source"] for i in neg}
    winner = pos if len(pos) >= len(neg) else neg
    if not winner:
        return None
    # Conf: average + small bonus per extra source
    base = sum(i["conf"] for i in winner) / len(winner)
    conf = min(1.0, base + 0.05 * (len(distinct) - 1))
    if len(distinct) < min_sources or conf < 0.7:
        # Below threshold — skip per SPEC unless community override
        if "community" not in distinct:
            return None
    return {
        "tag_type": "boolean",
        "bool_value": winner is pos,
        "confidence": round(conf, 3),
        "evidence": winner,
    }


def aggregate_socket(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Socket tag writes when any reliable source has clear evidence."""
    return aggregate_boolean(items, min_sources=1)


def aggregate_pet_friendly(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Pet-friendly signals are sparse, so one reliable source is enough."""
    return aggregate_boolean(items, min_sources=1)


def aggregate_score(items: list[dict[str, Any]], tag_key: str) -> dict[str, Any] | None:
    """Score tag: sum positive contributions, subtract negatives, clip 0–100."""
    if not items:
        return None
    score = 0
    for i in items:
        v = i.get("value")
        if isinstance(v, int):
            delta = v
        else:
            delta = 15  # default contribution per qualitative signal
        if i.get("polarity") == "negative":
            score -= delta
        else:
            score += delta
    score = max(0, min(100, score))
    avg_conf = sum(i["conf"] for i in items) / len(items)
    distinct = {i["source"] for i in items}
    conf = min(1.0, avg_conf + 0.05 * (len(distinct) - 1))
    return {
        "tag_type": "score",
        "score_value": score,
        "confidence": round(conf, 3),
        "evidence": items,
    }


def aggregate_time_limit(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Structured tag: priority-pick canonical value."""
    if not items:
        return None
    items_sorted = sorted(
        items, key=lambda i: SOURCE_PRIORITY.get(i["source"], 0), reverse=True
    )
    chosen = items_sorted[0]
    val = chosen.get("value") or {}
    if not val.get("status"):
        return None
    avg_conf = sum(i["conf"] for i in items) / len(items)
    return {
        "tag_type": "structured",
        "structured_value": val,
        "confidence": round(min(1.0, avg_conf), 3),
        "evidence": items,
    }


def aggregate_reservable(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Reservation signals are sparse, so one reliable source is enough."""
    return aggregate_boolean(items, min_sources=1)


def aggregate_outdoor_seating(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Outdoor seating signals are sparse, so one reliable source is enough."""
    return aggregate_boolean(items, min_sources=1)


AGGREGATORS = {
    "socket_available": aggregate_socket,
    "pet_friendly": aggregate_pet_friendly,
    "reservable": aggregate_reservable,
    "outdoor_seating": aggregate_outdoor_seating,
    "study_friendly": lambda items: aggregate_score(items, "study_friendly"),
    "discussion_friendly": lambda items: aggregate_score(items, "discussion_friendly"),
    "group_chat_friendly": lambda items: aggregate_score(items, "group_chat_friendly"),
    "time_limit": aggregate_time_limit,
}


# Tuning knobs for batched DB writes
BATCH_SIZE = 100  # cafes per batch
EVIDENCE_CHUNK = 500  # max rows per tag_evidence insert


def _build_tag_row(cafe_id: str, tag_key: str, agg: dict[str, Any], today: str) -> dict[str, Any]:
    row: dict[str, Any] = {
        "cafe_id": cafe_id,
        "tag_key": tag_key,
        "tag_type": agg["tag_type"],
        "confidence": agg["confidence"],
        "last_verified_at": today,
    }
    if agg["tag_type"] == "boolean":
        row["bool_value"] = agg["bool_value"]
    elif agg["tag_type"] == "score":
        row["score_value"] = agg["score_value"]
    elif agg["tag_type"] == "structured":
        row["structured_value"] = agg["structured_value"]
    return row


def process_cafes_batch(cafe_ids: list[str]) -> dict[str, int]:
    """Aggregate + persist tags for a batch of cafes with minimal round trips.

    Round trips per batch (regardless of cafe count):
      1× select reviews_raw, 1× select cafe_tags (lock check),
      1× upsert cafe_tags, 1× delete tag_evidence, N× insert tag_evidence
      (chunked by EVIDENCE_CHUNK).
    """
    if not cafe_ids:
        return {"cafes": 0, "tags": 0}
    db = get_client()

    # 1) Fetch all raw signals for the batch in one query, group in memory.
    raw_rows = (
        db.table("reviews_raw")
        .select("id, cafe_id, source_id, external_id, text, extracted_signals")
        .in_("cafe_id", cafe_ids)
        .execute()
        .data
    )
    by_cafe: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in raw_rows:
        by_cafe[r["cafe_id"]].append(r)

    # 2) Aggregate per (cafe, tag).
    aggregated: dict[tuple[str, str], dict[str, Any]] = {}
    for cid, rows in by_cafe.items():
        by_tag = collect_signals(rows)
        for tag_key, agg_fn in AGGREGATORS.items():
            agg = agg_fn(by_tag.get(tag_key, []))
            if agg:
                aggregated[(cid, tag_key)] = agg

    if not aggregated:
        return {"cafes": 0, "tags": 0}

    # 3) One lock-check query for the whole batch; drop community-locked tags.
    lock_rows = (
        db.table("cafe_tags")
        .select("cafe_id, tag_key, locked_by_community")
        .in_("cafe_id", cafe_ids)
        .execute()
        .data
    )
    locked = {
        (r["cafe_id"], r["tag_key"]) for r in lock_rows if r.get("locked_by_community")
    }
    for key in list(aggregated.keys()):
        if key in locked:
            aggregated.pop(key)

    if not aggregated:
        return {"cafes": 0, "tags": 0}

    # 4) Bulk upsert cafe_tags; PostgREST evaluates on_conflict per row.
    today = date.today().isoformat()
    tag_rows = [
        _build_tag_row(cid, tag_key, agg, today)
        for (cid, tag_key), agg in aggregated.items()
    ]
    upserted = (
        db.table("cafe_tags")
        .upsert(tag_rows, on_conflict="cafe_id,tag_key")
        .execute()
        .data
    )
    key_to_id = {(r["cafe_id"], r["tag_key"]): r["id"] for r in upserted}

    # 5) Replace evidence: one delete + chunked inserts.
    tag_ids = list(key_to_id.values())
    if tag_ids:
        db.table("tag_evidence").delete().in_("cafe_tag_id", tag_ids).execute()

    evidence_rows: list[dict[str, Any]] = []
    for (cid, tag_key), agg in aggregated.items():
        tag_id = key_to_id.get((cid, tag_key))
        if not tag_id:
            continue
        for ev in agg["evidence"]:
            evidence_rows.append(
                {
                    "cafe_tag_id": tag_id,
                    "source_id": ev["source"],
                    "review_id": ev.get("review_id"),
                    "text": (ev.get("text") or "")[:500],
                    "confidence": ev["conf"],
                    "extra": ev.get("extra") or {},
                }
            )
    for i in range(0, len(evidence_rows), EVIDENCE_CHUNK):
        db.table("tag_evidence").insert(evidence_rows[i : i + EVIDENCE_CHUNK]).execute()

    cafes_with_tags = {cid for (cid, _) in aggregated.keys()}
    return {"cafes": len(cafes_with_tags), "tags": len(aggregated)}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="only process N cafes")
    parser.add_argument("--cafe-id", type=str, default=None)
    args = parser.parse_args()

    db = get_client()
    if args.cafe_id:
        cafe_ids = [args.cafe_id]
    else:
        q = db.table("cafes").select("id")
        if args.limit:
            q = q.limit(args.limit)
        cafe_ids = [r["id"] for r in q.execute().data]

    logger.info("Processing %d cafes (batch_size=%d)", len(cafe_ids), BATCH_SIZE)
    totals = {"tags": 0, "cafes": 0}
    for i in range(0, len(cafe_ids), BATCH_SIZE):
        batch = cafe_ids[i : i + BATCH_SIZE]
        try:
            stats = process_cafes_batch(batch)
        except Exception:
            logger.exception("Batch failed (cafe_ids=%s)", batch)
            continue
        totals["cafes"] += stats["cafes"]
        totals["tags"] += stats["tags"]
        logger.info(
            "Batch %d–%d done (cafes=%d, tags=%d)",
            i + 1,
            i + len(batch),
            stats["cafes"],
            stats["tags"],
        )
    logger.info("Totals: %s", totals)


if __name__ == "__main__":
    main()
