"""Reset all Google-derived data so the pipeline can re-process from scratch.

Scope (Google-only — Cafe Nomad / Instagram / community data are preserved):

- ``reviews_raw``      : delete rows where ``source_id = 'google_places'``
- ``tag_evidence``     : delete rows where ``source_id = 'google_places'``
- ``cafe_tags``        : delete rows where ``locked_by_community = false``
                         (semantic.py only upserts; stale aggregated tags
                         would otherwise linger after rule changes)
- ``cafes.summary_ai`` : NULL out (depends on reviews; ai_summary will regen)
- ``dead_letter``      : delete rows where ``source_id = 'google_places'``

Rows in ``cafe_tags`` with ``locked_by_community = true`` are kept untouched —
those are community overrides and must not be wiped by an AI re-run.

Optional: with ``--reset-instagram-signals``, also NULL out
``extracted_signals`` and ``processed_at`` on instagram reviews_raw rows so
``instagram_extract.py`` will re-run the LLM (the IG row text is preserved).
Use this when the LLM prompt / Signal schema has changed; skip it if only
the semantic.py aggregation rules changed.

Usage:
    uv run python -m coffee_pocket.agents.maintenance.reset_google_data
    uv run python -m coffee_pocket.agents.maintenance.reset_google_data --yes
    uv run python -m coffee_pocket.agents.maintenance.reset_google_data \
        --reset-instagram-signals --yes
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

from ...db import get_client

GOOGLE_SOURCE_ID = "google_places"


def _count(db: Any, table: str, *filters: tuple[str, str, Any]) -> int:
    q = db.table(table).select("id", count="exact")
    for op, col, val in filters:
        if op == "eq":
            q = q.eq(col, val)
        elif op == "is":
            q = q.is_(col, val)
        elif op == "not_is":
            q = q.not_.is_(col, val)
        else:
            raise ValueError(f"unknown op {op}")
    res = q.limit(1).execute()
    return res.count or 0


def _preview(db: Any, *, reset_ig: bool) -> dict[str, int]:
    out = {
        "reviews_raw (google_places)": _count(
            db, "reviews_raw", ("eq", "source_id", GOOGLE_SOURCE_ID)
        ),
        "tag_evidence (google_places)": _count(
            db, "tag_evidence", ("eq", "source_id", GOOGLE_SOURCE_ID)
        ),
        "cafe_tags (not community-locked)": _count(
            db, "cafe_tags", ("eq", "locked_by_community", False)
        ),
        "cafe_tags (community-locked, KEPT)": _count(
            db, "cafe_tags", ("eq", "locked_by_community", True)
        ),
        "cafes.summary_ai (non-null)": _count(
            db, "cafes", ("not_is", "summary_ai", "null")
        ),
        "dead_letter (google_places)": _count(
            db, "dead_letter", ("eq", "source_id", GOOGLE_SOURCE_ID)
        ),
        "reviews_raw (cafe_nomad, KEPT)": _count(
            db, "reviews_raw", ("eq", "source_id", "cafe_nomad")
        ),
        "reviews_raw (instagram, KEPT)": _count(
            db, "reviews_raw", ("eq", "source_id", "instagram")
        ),
    }
    if reset_ig:
        out["instagram signals to reset (extracted_signals not null)"] = _count(
            db,
            "reviews_raw",
            ("eq", "source_id", "instagram"),
            ("not_is", "extracted_signals", "null"),
        )
    return out


def _print_preview(counts: dict[str, int]) -> None:
    print("\n=== 將要進行的清理（preview） ===")
    for k, v in counts.items():
        marker = "  (保留)" if "KEPT" in k else ""
        print(f"  {k:<42}  {v:>8}{marker}")


def run(*, apply: bool, reset_ig: bool) -> None:
    db = get_client()
    counts = _preview(db, reset_ig=reset_ig)
    _print_preview(counts)

    if not apply:
        print("\n以上為預覽；加 --yes 才會實際執行刪除/清空。")
        return

    print("\n=== 開始執行清理 ===")

    # 1) tag_evidence: drop Google-source evidence first (before we drop their
    #    parent cafe_tags), so we don't rely on cascade behaviour for them.
    res = (
        db.table("tag_evidence")
        .delete(count="exact")
        .eq("source_id", GOOGLE_SOURCE_ID)
        .execute()
    )
    print(f"  tag_evidence (google_places) 已刪除：{res.count}")

    # 2) cafe_tags: delete all non-locked rows. tag_evidence rows attached to
    #    these cafe_tags cascade-delete automatically. Community-locked tags
    #    stay untouched.
    res = (
        db.table("cafe_tags")
        .delete(count="exact")
        .eq("locked_by_community", False)
        .execute()
    )
    print(f"  cafe_tags (非 community-locked) 已刪除：{res.count}")

    # 3) reviews_raw: drop Google rows; cafe_nomad / instagram stay.
    res = (
        db.table("reviews_raw")
        .delete(count="exact")
        .eq("source_id", GOOGLE_SOURCE_ID)
        .execute()
    )
    print(f"  reviews_raw (google_places) 已刪除：{res.count}")

    # 4) cafes.summary_ai: clear (depends on review text; will regenerate).
    res = (
        db.table("cafes")
        .update({"summary_ai": None}, count="exact")
        .not_.is_("summary_ai", "null")
        .execute()
    )
    print(f"  cafes.summary_ai 已清空：{res.count}")

    # 5) dead_letter: drop Google failures.
    res = (
        db.table("dead_letter")
        .delete(count="exact")
        .eq("source_id", GOOGLE_SOURCE_ID)
        .execute()
    )
    print(f"  dead_letter (google_places) 已刪除：{res.count}")

    # 6) Optional: reset Instagram signals so instagram_extract.py re-runs LLM.
    if reset_ig:
        res = (
            db.table("reviews_raw")
            .update(
                {"extracted_signals": None, "processed_at": None},
                count="exact",
            )
            .eq("source_id", "instagram")
            .not_.is_("extracted_signals", "null")
            .execute()
        )
        print(f"  reviews_raw (instagram) signals 已重設：{res.count}")

    print("\n完成。可以重新跑 google_scraper → google_extract → semantic → ai_summary。")
    if reset_ig:
        print("（IG 還需要再跑 instagram_extract.py 來重抽 signals。）")


def main() -> None:
    ap = argparse.ArgumentParser(
        description="清除所有 Google 來源的資料，保留 Cafe Nomad / Instagram / 社群編輯。"
    )
    ap.add_argument("--yes", action="store_true", help="實際執行（不加就只 preview）")
    ap.add_argument(
        "--reset-instagram-signals",
        action="store_true",
        help="同時把 IG reviews_raw 的 extracted_signals/processed_at 設回 NULL，"
        "讓 instagram_extract.py 之後可重抽 LLM（原文保留）。",
    )
    args = ap.parse_args()
    try:
        run(apply=args.yes, reset_ig=args.reset_instagram_signals)
    except KeyboardInterrupt:
        print("\n中斷。", file=sys.stderr)


if __name__ == "__main__":
    main()
