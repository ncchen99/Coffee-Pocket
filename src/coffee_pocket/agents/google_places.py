"""Google Places Agent — match cafes via Text Search, fetch reviews,
LLM-extract signals per batch, persist to reviews_raw / dead_letter.

Flow (per specs/AGENTS.md §2.2):
  1. Pick cafes lacking google_place_id (subject to --limit)
  2. Places Text Search by "<name> <address>" → google_place_id
  3. Place Details with `reviews` field → upsert into reviews_raw
  4. Chunk reviews ≤ 20 → OpenRouter (DeepSeek) JSON extraction
  5. Validate against pydantic schema; failures → dead_letter
  6. Stamp reviews_raw.processed_at on success
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime, timezone
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field, ValidationError

from ..config import settings
from ..db import get_client
from ..llm import LLMError, chat_json

logger = logging.getLogger(__name__)

TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"
CHUNK_SIZE = 20


# ----- LLM output schema --------------------------------------------------


class Signal(BaseModel):
    type: Literal[
        "socket_available",
        "study_friendly",
        "discussion_friendly",
        "time_limit",
        "noise_level",
        "wifi_quality",
        "seating_availability",
    ]
    polarity: Literal["positive", "negative", "neutral"] | None = None
    value: dict[str, Any] | int | str | bool | None = None
    evidence: str
    review_id: str | None = None


class ExtractionResult(BaseModel):
    signals: list[Signal] = Field(default_factory=list)


SYSTEM_PROMPT = """你是 Coffee Pocket 的咖啡廳評論語意萃取器。
輸入是多則 Google 評論，輸出**嚴格符合**以下 JSON Schema：

{
  "signals": [
    {
      "type": "socket_available" | "study_friendly" | "discussion_friendly" | "time_limit" | "noise_level" | "wifi_quality" | "seating_availability",
      "polarity": "positive" | "negative" | "neutral" | null,
      "value": <依 type 而定，見下>,
      "evidence": "<引用評論短句, ≤80字>",
      "review_id": "<必須等於輸入裡的 id 字串>"
    }
  ]
}

type 對應的 value 規則：
- socket_available：value = true / false / null；polarity 必填。
- study_friendly / discussion_friendly：value 可為 null；polarity 必填（positive/negative）。
- time_limit：value = {"status": "unlimited" | "conditional" | "limited", "duration_minutes": int|null}。
- noise_level / wifi_quality / seating_availability：value = 1~5 整數。

語意提示（繁中關鍵字示意，不是窮舉）：
- 插座：「有插座/每桌都有/可以充電/沒有插座」
- 讀書辦公：「適合讀書/工作/安靜/桌子大/位置寬」 vs 「很吵/限時/不適合久坐」
- 聊天聚會：「適合聊天/朋友聚餐/聚會/熱鬧」 vs 「太安靜/不能講話」
- 限時：「限時 90 分鐘」「假日限時」「不限時」

範例輸出（給定兩則評論 id=r1, r2）：
{"signals":[
  {"type":"socket_available","polarity":"positive","value":true,"evidence":"每張桌子都有插座","review_id":"r1"},
  {"type":"time_limit","polarity":null,"value":{"status":"limited","duration_minutes":90},"evidence":"假日限時 90 分鐘","review_id":"r2"}
]}

絕對規則：
- `signals` **永遠是陣列**（即使空也要回 {"signals": []}）。不可回傳數字或物件代替。
- 只輸出有實際依據的 signal；不要編造。沒有訊號就回空陣列。
- 純讚美無具體訊號（「好喝」「老闆親切」）不產生 signal。
- review_id 必須完全等於輸入的 id 字串。
- 只輸出 JSON，**不要**前後解說、不要 markdown 圍欄。"""


# ----- Google APIs ---------------------------------------------------------


def text_search(query: str) -> str | None:
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_places_api_key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    }
    body = {"textQuery": query, "languageCode": "zh-TW", "regionCode": "TW"}
    with httpx.Client(timeout=30) as client:
        resp = client.post(TEXT_SEARCH_URL, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()
    places = data.get("places") or []
    if not places:
        return None
    return places[0].get("id")


def place_details(place_id: str) -> dict[str, Any]:
    headers = {
        "X-Goog-Api-Key": settings.google_places_api_key,
        "X-Goog-FieldMask": (
            "id,displayName,formattedAddress,googleMapsUri,"
            "regularOpeningHours,reviews,rating,userRatingCount"
        ),
    }
    params = {"languageCode": "zh-TW", "regionCode": "TW"}
    with httpx.Client(timeout=30) as client:
        resp = client.get(
            PLACE_DETAILS_URL.format(place_id=place_id), headers=headers, params=params
        )
        resp.raise_for_status()
        return resp.json()


# ----- Pipeline steps ------------------------------------------------------


def pick_cafes(limit: int, *, refresh: bool = False) -> list[dict[str, Any]]:
    db = get_client()
    q = db.table("cafes").select("id, name, address, cafe_nomad_id, google_place_id")
    if refresh:
        q = q.not_.is_("google_place_id", "null")
    else:
        q = q.is_("google_place_id", "null")
    rows = q.limit(limit).execute().data
    return rows


def update_cafe_from_details(cafe_id: str, details: dict[str, Any]) -> None:
    db = get_client()
    update: dict[str, Any] = {
        "google_place_id": details.get("id"),
        "google_maps_url": details.get("googleMapsUri"),
    }
    hours = details.get("regularOpeningHours")
    if hours:
        update["business_hours"] = hours
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    db.table("cafes").update(update).eq("id", cafe_id).execute()


def upsert_reviews(cafe_id: str, place_id: str, reviews: list[dict[str, Any]]) -> list[str]:
    """Upsert reviews_raw rows. Returns inserted reviews_raw.id list (in order)."""
    if not reviews:
        return []
    db = get_client()
    rows = []
    for r in reviews:
        external_id = r.get("name") or r.get("id")
        if not external_id:
            continue
        text = (r.get("text") or {}).get("text") or (r.get("originalText") or {}).get("text") or ""
        if not text:
            continue
        rating = r.get("rating")
        posted_at = r.get("publishTime")
        author = (r.get("authorAttribution") or {}).get("displayName")
        rows.append(
            {
                "cafe_id": cafe_id,
                "source_id": "google_places",
                "external_id": external_id,
                "author": author,
                "rating": rating,
                "text": text,
                "posted_at": posted_at,
            }
        )
    if not rows:
        return []
    db.table("reviews_raw").upsert(rows, on_conflict="source_id,external_id").execute()

    # Re-read ids
    ext_ids = [r["external_id"] for r in rows]
    fetched = (
        db.table("reviews_raw")
        .select("id, external_id")
        .eq("source_id", "google_places")
        .in_("external_id", ext_ids)
        .execute()
        .data
    )
    id_by_ext = {r["external_id"]: r["id"] for r in fetched}
    return [id_by_ext[r["external_id"]] for r in rows if r["external_id"] in id_by_ext]


def chunk_reviews_for_llm(
    review_ids: list[str], reviews: list[dict[str, Any]]
) -> list[list[dict[str, str]]]:
    """Build LLM-input chunks; each item is {id, text}."""
    items: list[dict[str, str]] = []
    for rid, r in zip(review_ids, reviews):
        text = (r.get("text") or {}).get("text") or (r.get("originalText") or {}).get("text") or ""
        if not text:
            continue
        items.append({"id": rid, "text": text})
    return [items[i : i + CHUNK_SIZE] for i in range(0, len(items), CHUNK_SIZE)]


def extract_signals(chunk: list[dict[str, str]]) -> ExtractionResult:
    user_payload = {"reviews": chunk}
    import json

    raw = chat_json(SYSTEM_PROMPT, json.dumps(user_payload, ensure_ascii=False))
    return ExtractionResult.model_validate(raw)


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


# ----- Main ---------------------------------------------------------------


def process_cafe(cafe: dict[str, Any], *, max_reviews: int = 5) -> dict[str, int]:
    place_id = cafe.get("google_place_id")
    if not place_id:
        query = f"{cafe['name']} {cafe.get('address') or ''}".strip()
        place_id = text_search(query)
    if not place_id:
        logger.warning("No Google place found for cafe=%s (%s)", cafe["name"], cafe["id"])
        return {"matched": 0, "reviews": 0, "signals": 0}

    details = place_details(place_id)
    update_cafe_from_details(cafe["id"], details)

    reviews = details.get("reviews") or []
    # Prefer recent reviews — sort by publishTime desc, keep top N
    reviews.sort(key=lambda r: r.get("publishTime") or "", reverse=True)
    reviews = reviews[:max_reviews]
    review_ids = upsert_reviews(cafe["id"], place_id, reviews)
    chunks = chunk_reviews_for_llm(review_ids, reviews)

    total_signals = 0
    signals_by_review: dict[str, list[dict]] = {rid: [] for rid in review_ids}
    processed_ids: list[str] = []

    for idx, chunk in enumerate(chunks):
        if idx > 0:
            time.sleep(2.5)  # free-tier rate-limit cushion
        try:
            result = extract_signals(chunk)
        except (LLMError, ValidationError) as exc:
            logger.warning("Extraction failed for chunk (cafe=%s): %s", cafe["name"], exc)
            write_dead_letter({"cafe_id": cafe["id"], "chunk": chunk}, str(exc))
            continue
        for sig in result.signals:
            total_signals += 1
            if sig.review_id and sig.review_id in signals_by_review:
                signals_by_review[sig.review_id].append(sig.model_dump())
        processed_ids.extend(item["id"] for item in chunk)

    mark_processed(processed_ids, signals_by_review)

    return {"matched": 1, "reviews": len(review_ids), "signals": total_signals}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Re-fetch reviews for cafes that already have google_place_id",
    )
    parser.add_argument("--max-reviews", type=int, default=5)
    args = parser.parse_args()

    cafes = pick_cafes(args.limit, refresh=args.refresh)
    logger.info(
        "Picked %d cafes (%s)",
        len(cafes),
        "refresh: with google_place_id" if args.refresh else "new: no google_place_id",
    )

    totals = {"matched": 0, "reviews": 0, "signals": 0}
    for i, cafe in enumerate(cafes):
        if i > 0:
            time.sleep(2.0)
        try:
            stats = process_cafe(cafe, max_reviews=args.max_reviews)
        except httpx.HTTPError as exc:
            logger.exception("HTTP error on cafe=%s: %s", cafe["name"], exc)
            continue
        for k, v in stats.items():
            totals[k] += v
        logger.info("Cafe %s → %s", cafe["name"], stats)

    logger.info("Totals: %s", totals)


if __name__ == "__main__":
    main()
