"""AI Summary Agent — generate concise cafe summaries from reviews.

Reads review texts from reviews_raw, sends them to OpenAI for summarization,
and writes the result to cafes.summary_ai.

Usage:
  uv run python -m coffee_pocket.agents.process.ai_summary            # all cafes missing summary
  uv run python -m coffee_pocket.agents.process.ai_summary --limit 10
  uv run python -m coffee_pocket.agents.process.ai_summary --cafe-id <uuid>
  uv run python -m coffee_pocket.agents.process.ai_summary --force     # overwrite existing
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from collections import defaultdict
from typing import Any

from ...db import get_client
from ...llm import LLMError, chat_json

logger = logging.getLogger(__name__)

SUMMARY_PROMPT = """你是 Coffee Pocket 的咖啡廳摘要生成器。
根據以下 Google 評論內容，為這間咖啡廳寫一段繁體中文摘要。

規則：
- 字數控制在 50 到 100 字之間
- 用自然、簡潔的語氣描述店家特色
- 重點涵蓋：環境氛圍、餐飲特色、適合的使用場景
- 不要列舉條目，用流暢的段落描述
- 不要提及評論者個人資訊
- 不要使用「根據評論」「網友表示」等 meta 語句
- 只輸出 JSON，不要前後解說、不要 markdown 圍欄

輸出格式：
{"summary": "<摘要文字>"}"""

# Max reviews to feed into a single summary request
MAX_REVIEWS_PER_CAFE = 20

# Batch size for fetching cafes from DB
BATCH_SIZE = 50


def generate_summary(cafe_name: str, review_texts: list[str]) -> str | None:
    """Call LLM to generate a summary from review texts. Returns the summary string or None."""
    if not review_texts:
        return None

    # Truncate each review to avoid token overflow
    truncated = [t[:300] for t in review_texts[:MAX_REVIEWS_PER_CAFE]]
    user_msg = json.dumps(
        {"cafe_name": cafe_name, "reviews": truncated},
        ensure_ascii=False,
    )

    try:
        result = chat_json(SUMMARY_PROMPT, user_msg)
    except LLMError as exc:
        logger.warning("LLM failed for %s: %s", cafe_name, exc)
        return None

    summary = result.get("summary")
    if not summary or not isinstance(summary, str):
        logger.warning("LLM returned invalid summary for %s: %s", cafe_name, result)
        return None

    # Sanity check length (allow some tolerance)
    if len(summary) < 20:
        logger.warning("Summary too short for %s (%d chars): %s", cafe_name, len(summary), summary)
        return None

    return summary.strip()


def fetch_cafes_to_process(
    *,
    cafe_id: str | None = None,
    force: bool = False,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    """Fetch cafes that need summary generation."""
    db = get_client()
    q = db.table("cafes").select("id, name")

    if cafe_id:
        q = q.eq("id", cafe_id)
    elif not force:
        q = q.is_("summary_ai", "null")

    if limit:
        q = q.limit(limit)

    return q.execute().data


def fetch_reviews_for_cafes(cafe_ids: list[str]) -> dict[str, list[str]]:
    """Fetch review texts grouped by cafe_id. Only includes non-empty texts."""
    if not cafe_ids:
        return {}

    db = get_client()
    # Fetch in batches to avoid URL-length limits
    all_rows: list[dict[str, Any]] = []
    for i in range(0, len(cafe_ids), BATCH_SIZE):
        batch = cafe_ids[i : i + BATCH_SIZE]
        offset = 0
        limit = 1000
        while True:
            rows = (
                db.table("reviews_raw")
                .select("cafe_id, text")
                .in_("cafe_id", batch)
                .not_.is_("text", "null")
                .order("posted_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
                .data
            )
            all_rows.extend(rows)
            if len(rows) < limit:
                break
            offset += limit

    by_cafe: dict[str, list[str]] = defaultdict(list)
    for r in all_rows:
        text = (r.get("text") or "").strip()
        if text:
            by_cafe[r["cafe_id"]].append(text)
    return by_cafe


def write_summary(cafe_id: str, summary: str) -> None:
    """Write the generated summary to cafes.summary_ai."""
    db = get_client()
    db.table("cafes").update({"summary_ai": summary}).eq("id", cafe_id).execute()


def process_cafes(
    cafes: list[dict[str, Any]],
    reviews_by_cafe: dict[str, list[str]],
) -> dict[str, int]:
    """Generate and persist summaries for a list of cafes."""
    stats = {"processed": 0, "skipped": 0, "failed": 0}

    for i, cafe in enumerate(cafes):
        cafe_id = cafe["id"]
        cafe_name = cafe.get("name", "?")
        texts = reviews_by_cafe.get(cafe_id, [])

        if not texts:
            logger.debug("No reviews for %s — skipping", cafe_name)
            stats["skipped"] += 1
            continue

        # Rate-limit: small delay between LLM calls
        if i > 0:
            time.sleep(1.0)

        summary = generate_summary(cafe_name, texts)
        if not summary:
            stats["failed"] += 1
            continue

        write_summary(cafe_id, summary)
        logger.info("  %s → %s", cafe_name, summary[:60])
        stats["processed"] += 1

    return stats


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Generate AI summaries for cafes from reviews")
    parser.add_argument("--limit", type=int, default=None, help="Process at most N cafes")
    parser.add_argument("--cafe-id", type=str, default=None, help="Process a single cafe by ID")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing summaries (default: only process nulls)",
    )
    args = parser.parse_args()

    cafes = fetch_cafes_to_process(
        cafe_id=args.cafe_id,
        force=args.force,
        limit=args.limit,
    )
    logger.info("Found %d cafes to process", len(cafes))

    if not cafes:
        logger.info("Nothing to do")
        return

    cafe_ids = [c["id"] for c in cafes]
    reviews_by_cafe = fetch_reviews_for_cafes(cafe_ids)
    cafes_with_reviews = sum(1 for cid in cafe_ids if cid in reviews_by_cafe)
    logger.info(
        "Fetched reviews for %d/%d cafes (%d total review texts)",
        cafes_with_reviews,
        len(cafes),
        sum(len(v) for v in reviews_by_cafe.values()),
    )

    stats = process_cafes(cafes, reviews_by_cafe)
    logger.info("Done: %s", stats)


if __name__ == "__main__":
    main()
