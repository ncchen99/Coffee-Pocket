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

# v2.0: map-reduce 摘要。
# 1) Map：每批 BULLET_BATCH_SIZE 筆評論 → LLM 抽 3~5 個重點短句。
# 2) Reduce：所有重點短句 → LLM 整合 50~100 字摘要。

BULLET_PROMPT = """你是 Coffee Pocket 的評論重點萃取器。讀完輸入的評論後，抽出 3~5 個這些評論共同呈現的重點短句。

規則：
- 每個短句 ≤ 30 字，繁體中文。
- 重點限定在以下幾個面向：環境氛圍 / 餐飲特色 / 使用場景 / 服務 / 位置交通。
- 只輸出多位評論者都提到、或重複出現的規律；單一評論者的個人雜記不需保留。
- 不要提評論者姓名、不要寫「有人說 / 評論提到」這類 meta 語句。
- 只輸出 JSON，不要 markdown 圍欄。

輸出格式：
{"bullets": ["<短句1>", "<短句2>", ...]}"""

SUMMARY_PROMPT = """你是 Coffee Pocket 的咖啡廳摘要生成器。
輸入是這間店多個評論抽出的重點短句集合，請整合成一段繁體中文摘要。

規則：
- 字數 50 到 100 字之間。
- 自然、簡潔的語氣，用流暢段落、不要列點。
- 重點依序：環境氛圍 → 餐飲特色 → 適合使用場景。
- 不要提「評論者」、「有人」、「根據評論」這種 meta 語句。
- 只輸出 JSON，不要 markdown 圍欄。

輸出格式：
{"summary": "<50~100字摘要>"}"""

# Map 階段每批評論數
BULLET_BATCH_SIZE = 25
# Map 階段每筆評論最多保留多少字
MAX_REVIEW_CHARS = 280
# Reduce 階段最多接受多少個 bullets（避免 prompt 太長）
MAX_BULLETS_FOR_REDUCE = 50
# 每間店最多處理多少筆評論
MAX_REVIEWS_PER_CAFE = 200

# Batch size for fetching cafes from DB
BATCH_SIZE = 50


def _extract_bullets(cafe_name: str, batch: list[str]) -> list[str]:
    """Map step: 一批評論 → 幾個重點短句。失敗回 []."""
    if not batch:
        return []
    payload = json.dumps(
        {
            "cafe_name": cafe_name,
            "reviews": [t[:MAX_REVIEW_CHARS] for t in batch],
        },
        ensure_ascii=False,
    )
    try:
        result = chat_json(BULLET_PROMPT, payload)
    except LLMError as exc:
        logger.warning("  bullet extraction failed for %s: %s", cafe_name, exc)
        return []

    bullets = result.get("bullets")
    if not isinstance(bullets, list):
        return []
    return [str(b).strip() for b in bullets if isinstance(b, str) and b.strip()]


def _reduce_bullets(cafe_name: str, bullets: list[str]) -> str | None:
    """Reduce step: 重點短句集合 → 50~100 字摘要。"""
    if not bullets:
        return None
    payload = json.dumps(
        {"cafe_name": cafe_name, "bullets": bullets[:MAX_BULLETS_FOR_REDUCE]},
        ensure_ascii=False,
    )
    try:
        result = chat_json(SUMMARY_PROMPT, payload)
    except LLMError as exc:
        logger.warning("  reduce failed for %s: %s", cafe_name, exc)
        return None
    summary = result.get("summary")
    if not isinstance(summary, str) or len(summary.strip()) < 20:
        logger.warning("  invalid summary for %s: %s", cafe_name, result)
        return None
    return summary.strip()


def generate_summary(cafe_name: str, review_texts: list[str]) -> str | None:
    """Map-reduce 摘要。輸入 ≤ MAX_REVIEWS_PER_CAFE 筆。"""
    if not review_texts:
        return None

    texts = review_texts[:MAX_REVIEWS_PER_CAFE]

    # 評論數量少：跳過 map 階段，直接當作 bullets 送 reduce。
    if len(texts) <= BULLET_BATCH_SIZE:
        bullets = [t[:MAX_REVIEW_CHARS] for t in texts]
        return _reduce_bullets(cafe_name, bullets)

    # Map: 分批萃取重點
    all_bullets: list[str] = []
    for i in range(0, len(texts), BULLET_BATCH_SIZE):
        chunk = texts[i : i + BULLET_BATCH_SIZE]
        if i > 0:
            time.sleep(0.5)
        all_bullets.extend(_extract_bullets(cafe_name, chunk))

    if not all_bullets:
        # Map 全部失敗，fallback：拿前 N 筆原始評論當 bullets
        all_bullets = [t[:MAX_REVIEW_CHARS] for t in texts[:BULLET_BATCH_SIZE]]

    # Reduce
    return _reduce_bullets(cafe_name, all_bullets)


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
