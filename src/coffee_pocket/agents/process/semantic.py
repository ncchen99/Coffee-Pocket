"""Semantic Agent — aggregate Raw Signals → cafe_tags + tag_evidence.

Reads from reviews_raw (cafe_nomad rows have signals; google_places rows have
signals stamped by the Google Places Agent) and writes the final Semantic
Layer per specs/SPEC.md and specs/AGENTS.md §3.

Tags handled (v2.0):
  Boolean (with evidence count + ratio threshold):
    - socket_most / socket_few         （互斥：most 成立則 few 跳過）
    - large_table_most / large_table_few（互斥）
    - wifi_available
    - high_cp_value                    （positive_ratio >= 0.6 規則）
    - scooter_parking_easy / car_parking_easy
    - has_resident_cat / has_resident_dog
    - reservable / outdoor_seating
  Score (0–100):
    - study_friendly / discussion_friendly / group_chat_friendly
  Structured:
    - time_limit                       （只保留 status，無 duration_minutes）

Deprecated（不再寫入，但 DB 舊資料保留）：socket_available, pet_friendly
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

# v2.0 廢棄的 tag_keys —— pipeline 不再寫入，DB 舊資料保留
DEPRECATED_TAGS = {"socket_available", "pet_friendly"}

# Boolean tag 的證據門檻設定
# minimum_evidence: 至少 N 筆正向證據才成立
# minimum_ratio:    positive / max(total_reviews, pos+neg) 至少 R
DEFAULT_BOOL_THRESHOLD = {"min_evidence": 2, "min_ratio": 0.15}
TAG_THRESHOLDS: dict[str, dict[str, float]] = {
    # 駐店動物比較稀疏，門檻略放寬
    "has_resident_cat": {"min_evidence": 2, "min_ratio": 0.10},
    "has_resident_dog": {"min_evidence": 2, "min_ratio": 0.10},
    # reservable / outdoor_seating 稀疏訊號，1 筆即可（保留 v1.0 行為）
    "reservable": {"min_evidence": 1, "min_ratio": 0.0},
    "outdoor_seating": {"min_evidence": 1, "min_ratio": 0.0},
}

# high_cp_value 用「正向佔比 >= positive_ratio」的特殊規則
CP_POSITIVE_RATIO = 0.6
CP_MIN_EVIDENCE = 2


def collect_signals(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Normalize raw rows → {tag_key: [{source, polarity/value, text, review_id, conf}, …]}.

    v2.0：
      - cafe_nomad.socket=yes → socket_most positive；maybe → socket_few positive；no → socket_most negative
      - cafe_nomad.wifi=yes → wifi_available positive；no → wifi_available negative
      - cafe_nomad.limited_time → time_limit status（unlimited/limited/conditional）
      - cafe_nomad.quiet → study_friendly / discussion_friendly score bonus
      - google_places / instagram：直接讀 extracted_signals list
    """
    by_tag: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        sig_blob = row.get("extracted_signals") or {}
        src = row["source_id"]

        if src == "cafe_nomad":
            inner = sig_blob.get("signals") or {}

            # socket_available (legacy field name in cafe_nomad raw signals)
            #   true  → socket_most positive
            #   false → socket_most negative
            #   "partial" → socket_few positive
            socket = inner.get("socket_available")
            if socket is True:
                by_tag["socket_most"].append({
                    "source": src, "polarity": "positive", "value": True,
                    "text": "Cafe Nomad: socket=yes", "review_id": row["id"],
                    "conf": SOURCE_BASE_CONF[src], "extra": {"raw": socket},
                })
            elif socket is False:
                by_tag["socket_most"].append({
                    "source": src, "polarity": "negative", "value": False,
                    "text": "Cafe Nomad: socket=no", "review_id": row["id"],
                    "conf": SOURCE_BASE_CONF[src], "extra": {"raw": socket},
                })
            elif socket == "partial":
                by_tag["socket_few"].append({
                    "source": src, "polarity": "positive", "value": True,
                    "text": "Cafe Nomad: socket=maybe", "review_id": row["id"],
                    "conf": SOURCE_BASE_CONF[src], "extra": {"raw": socket},
                })

            # wifi_available：cafe_nomad 用 1~5 wifi_quality 表示，視 >=3 為「有」
            wifi_q = inner.get("wifi_quality")
            if isinstance(wifi_q, int):
                if wifi_q >= 3:
                    by_tag["wifi_available"].append({
                        "source": src, "polarity": "positive", "value": True,
                        "text": f"Cafe Nomad wifi_quality={wifi_q}", "review_id": row["id"],
                        "conf": SOURCE_BASE_CONF[src], "extra": {"wifi_quality": wifi_q},
                    })
                elif wifi_q <= 1:
                    by_tag["wifi_available"].append({
                        "source": src, "polarity": "negative", "value": False,
                        "text": f"Cafe Nomad wifi_quality={wifi_q}", "review_id": row["id"],
                        "conf": SOURCE_BASE_CONF[src], "extra": {"wifi_quality": wifi_q},
                    })

            # time_limit
            time_status = (inner.get("time_limit") or {}).get("status")
            if time_status:
                by_tag["time_limit"].append({
                    "source": src, "value": {"status": time_status},
                    "text": f"Cafe Nomad limited_time={time_status}",
                    "review_id": row["id"], "conf": SOURCE_BASE_CONF[src], "extra": {},
                })

            # noise_level → score bonus
            quiet = inner.get("noise_level")
            if isinstance(quiet, int):
                if quiet >= 4:
                    by_tag["study_friendly"].append({
                        "source": src, "polarity": "positive", "value": 25,
                        "text": f"Cafe Nomad quiet={quiet}", "review_id": row["id"],
                        "conf": SOURCE_BASE_CONF[src], "extra": {"quiet": quiet},
                    })
                elif quiet <= 3:
                    by_tag["discussion_friendly"].append({
                        "source": src, "polarity": "positive", "value": 20,
                        "text": f"Cafe Nomad quiet={quiet}", "review_id": row["id"],
                        "conf": SOURCE_BASE_CONF[src], "extra": {"quiet": quiet},
                    })

        elif src in {"google_places", "instagram"}:
            # extracted_signals here is a list (per-review signals list)
            sigs = sig_blob if isinstance(sig_blob, list) else []
            for s in sigs:
                tag = s.get("type")
                if not tag:
                    continue
                # 跳過已廢棄的 tag（保險）
                if tag in DEPRECATED_TAGS:
                    continue
                by_tag[tag].append({
                    "source": src,
                    "polarity": s.get("polarity"),
                    "value": s.get("value"),
                    "text": s.get("evidence"),
                    "review_id": row["id"],
                    "conf": SOURCE_BASE_CONF[src],
                    "extra": {},
                })
    return by_tag


def aggregate_boolean(
    items: list[dict[str, Any]],
    *,
    tag_key: str | None = None,
    total_reviews: int = 0,
) -> dict[str, Any] | None:
    """Boolean tag with v2.0 evidence-count + ratio threshold.

    Rules:
      - Community evidence overrides everything（直接寫入，不檢查門檻）。
      - Else require: positive_count >= min_evidence AND
                      positive_count / max(total_reviews, pos+neg) >= min_ratio.
      - 若反向證據 > 正向證據 → 寫入 False（同樣須過 min_evidence 門檻）。
    """
    if not items:
        return None

    pos = [i for i in items if i.get("polarity") == "positive"]
    neg = [i for i in items if i.get("polarity") == "negative"]

    # community 覆寫
    community = [i for i in items if i["source"] == "community"]
    if community:
        latest = community[-1]
        is_pos = latest.get("polarity") == "positive"
        return {
            "tag_type": "boolean",
            "bool_value": bool(is_pos),
            "confidence": 1.0,
            "evidence": community,
        }

    threshold = TAG_THRESHOLDS.get(tag_key or "", DEFAULT_BOOL_THRESHOLD)
    min_evidence = int(threshold["min_evidence"])
    min_ratio = float(threshold["min_ratio"])

    winner = pos if len(pos) >= len(neg) else neg
    if not winner:
        return None
    if len(winner) < min_evidence:
        return None

    denom = max(total_reviews, len(pos) + len(neg), 1)
    ratio = len(winner) / denom
    if ratio < min_ratio:
        return None

    distinct = {i["source"] for i in winner}
    base = sum(i["conf"] for i in winner) / len(winner)
    conf = min(1.0, base + 0.05 * (len(distinct) - 1))
    if conf < 0.7:
        return None

    return {
        "tag_type": "boolean",
        "bool_value": winner is pos,
        "confidence": round(conf, 3),
        "evidence": winner,
    }


def aggregate_cp_value(
    items: list[dict[str, Any]],
    *,
    total_reviews: int = 0,
) -> dict[str, Any] | None:
    """high_cp_value 用「正向佔比 >= CP_POSITIVE_RATIO」聚合。

    - 至少 CP_MIN_EVIDENCE 筆證據（pos+neg）。
    - positive / (positive+negative) >= 0.6 → True。
    - 否則 False（包含一半一半）。
    - 但若 pos+neg < CP_MIN_EVIDENCE，且沒有 community 覆寫 → 不寫入。
    """
    if not items:
        return None

    community = [i for i in items if i["source"] == "community"]
    if community:
        latest = community[-1]
        return {
            "tag_type": "boolean",
            "bool_value": latest.get("polarity") == "positive",
            "confidence": 1.0,
            "evidence": community,
        }

    pos = [i for i in items if i.get("polarity") == "positive"]
    neg = [i for i in items if i.get("polarity") == "negative"]
    total = len(pos) + len(neg)
    if total < CP_MIN_EVIDENCE:
        return None

    ratio = len(pos) / total
    is_high_cp = ratio >= CP_POSITIVE_RATIO
    evidence = pos if is_high_cp else (neg or pos)
    base = sum(i["conf"] for i in evidence) / max(len(evidence), 1)
    distinct = {i["source"] for i in evidence}
    conf = min(1.0, base + 0.05 * (len(distinct) - 1))
    if conf < 0.7:
        return None
    return {
        "tag_type": "boolean",
        "bool_value": is_high_cp,
        "confidence": round(conf, 3),
        "evidence": evidence,
    }


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


# v2.0 boolean tag list（aggregate_boolean 共用，門檻看 TAG_THRESHOLDS）
BOOLEAN_TAGS = [
    "socket_most",
    "socket_few",
    "large_table_most",
    "large_table_few",
    "wifi_available",
    "scooter_parking_easy",
    "car_parking_easy",
    "has_resident_cat",
    "has_resident_dog",
    "reservable",
    "outdoor_seating",
]

# 互斥規則：當第一個 tag 為 True 時，第二個 tag 強制跳過（不寫入）
MUTUALLY_EXCLUSIVE_PAIRS = [
    ("socket_most", "socket_few"),
    ("large_table_most", "large_table_few"),
]


def _make_bool_aggregator(tag_key: str):
    def _agg(items: list[dict[str, Any]], *, total_reviews: int = 0):
        return aggregate_boolean(items, tag_key=tag_key, total_reviews=total_reviews)
    return _agg


def _make_score_aggregator(tag_key: str):
    def _agg(items: list[dict[str, Any]], *, total_reviews: int = 0):  # noqa: ARG001
        return aggregate_score(items, tag_key)
    return _agg


def _time_limit_wrapper(items: list[dict[str, Any]], *, total_reviews: int = 0):  # noqa: ARG001
    return aggregate_time_limit(items)


def _cp_wrapper(items: list[dict[str, Any]], *, total_reviews: int = 0):
    return aggregate_cp_value(items, total_reviews=total_reviews)


AGGREGATORS: dict[str, Any] = {
    **{tag: _make_bool_aggregator(tag) for tag in BOOLEAN_TAGS},
    "high_cp_value": _cp_wrapper,
    "study_friendly": _make_score_aggregator("study_friendly"),
    "discussion_friendly": _make_score_aggregator("discussion_friendly"),
    "group_chat_friendly": _make_score_aggregator("group_chat_friendly"),
    "time_limit": _time_limit_wrapper,
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

    # 1) Fetch all raw signals for the batch in one query (paginated to bypass 1000-row limit), group in memory.
    raw_rows = []
    limit = 1000
    offset = 0
    while True:
        rows = (
            db.table("reviews_raw")
            .select("id, cafe_id, source_id, external_id, text, extracted_signals")
            .in_("cafe_id", cafe_ids)
            .range(offset, offset + limit - 1)
            .execute()
            .data
        )
        raw_rows.extend(rows)
        if len(rows) < limit:
            break
        offset += limit

    by_cafe: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in raw_rows:
        by_cafe[r["cafe_id"]].append(r)

    # 2) Aggregate per (cafe, tag).
    aggregated: dict[tuple[str, str], dict[str, Any]] = {}
    for cid, rows in by_cafe.items():
        by_tag = collect_signals(rows)
        # 計算該店「總可用評論數」作為比例分母（Google + IG 評論，cafe_nomad 不計）
        total_reviews = sum(
            1 for r in rows if r["source_id"] in {"google_places", "instagram"}
        )

        per_cafe: dict[str, dict[str, Any]] = {}
        for tag_key, agg_fn in AGGREGATORS.items():
            try:
                agg = agg_fn(by_tag.get(tag_key, []), total_reviews=total_reviews)
            except TypeError:
                # 防呆：舊版 aggregator 不支援 total_reviews
                agg = agg_fn(by_tag.get(tag_key, []))
            if agg:
                per_cafe[tag_key] = agg

        # 套用互斥規則：most=True 時跳過 few
        for primary, secondary in MUTUALLY_EXCLUSIVE_PAIRS:
            primary_agg = per_cafe.get(primary)
            if primary_agg and primary_agg.get("bool_value") is True:
                per_cafe.pop(secondary, None)

        for tag_key, agg in per_cafe.items():
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
