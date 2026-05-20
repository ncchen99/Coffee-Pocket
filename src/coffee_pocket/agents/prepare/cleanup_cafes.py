"""Delete cafe rows that recheck_place_ids marked as not_found or duplicate.

After running ``recheck_place_ids --apply`` the cafes table has two kinds of
junk rows:

- ``business_status='not_found'`` — Google has no listing matching the name
  + address, so we can't enrich them. The user wants these dropped.
- ``duplicate_of`` populated — physical-same-store rows resolved to either
  another row's place_id or another row's canonical name. The user wants
  to keep only the canonical one.

The ``cafes`` PK is referenced by ``cafe_tags(cafe_id) on delete cascade``,
so deleting a cafe also deletes its tags. Duplicate rows are unlikely to
have meaningful tag history (they're recent imports we never enriched),
but we still report the count up-front so the user can bail.

Usage:
    uv run python -m coffee_pocket.agents.prepare.cleanup_cafes              # preview only
    uv run python -m coffee_pocket.agents.prepare.cleanup_cafes --yes        # actually delete
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

from ...db import get_client


def _select_targets(db: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    not_found = (
        db.table("cafes")
        .select("id, name, address, google_place_id")
        .eq("business_status", "not_found")
        .execute()
        .data
        or []
    )
    duplicates = (
        db.table("cafes")
        .select("id, name, address, duplicate_of, google_place_id")
        .not_.is_("duplicate_of", "null")
        .execute()
        .data
        or []
    )
    return not_found, duplicates


def _count_tag_collateral(db: Any, ids: list[str]) -> int:
    if not ids:
        return 0
    # Supabase python client: in_() takes an iterable of values.
    res = db.table("cafe_tags").select("id", count="exact").in_("cafe_id", ids).execute()
    return res.count or 0


def _print_group(title: str, rows: list[dict[str, Any]]) -> None:
    print(f"\n=== {title} ({len(rows)}) ===")
    for r in rows[:50]:
        extra = ""
        if r.get("duplicate_of"):
            extra = f"  → {r['duplicate_of']}"
        print(f"  {r['id']}  {r.get('name')!r}  {r.get('address') or ''}{extra}")
    if len(rows) > 50:
        print(f"  ... 還有 {len(rows) - 50} 筆")


def run(*, apply: bool) -> None:
    db = get_client()
    not_found, duplicates = _select_targets(db)
    nf_ids = [r["id"] for r in not_found]
    dup_ids = [r["id"] for r in duplicates]
    all_ids = nf_ids + dup_ids

    _print_group("business_status='not_found' (要刪)", not_found)
    _print_group("duplicate_of 已標 (要刪)", duplicates)

    tag_count = _count_tag_collateral(db, all_ids)
    print(f"\n影響的 cafe_tags: {tag_count} 筆（會 cascade-delete）")

    if not all_ids:
        print("\n沒有東西可清。")
        return

    if not apply:
        print(f"\n總共要刪 {len(all_ids)} 筆 cafes。加 --yes 實際執行。")
        return

    # Delete duplicates first so any (unlikely) FK from duplicate_of points
    # at a still-existing canonical when not_found rows get removed.
    if dup_ids:
        db.table("cafes").delete().in_("id", dup_ids).execute()
        print(f"已刪除 {len(dup_ids)} 筆 duplicate cafes。")
    if nf_ids:
        db.table("cafes").delete().in_("id", nf_ids).execute()
        print(f"已刪除 {len(nf_ids)} 筆 not_found cafes。")


def main() -> None:
    ap = argparse.ArgumentParser(description="刪除 not_found 與 duplicate 的 cafe rows")
    ap.add_argument("--yes", action="store_true", help="實際執行刪除（不加就只 preview）")
    args = ap.parse_args()
    try:
        run(apply=args.yes)
    except KeyboardInterrupt:
        print("\n中斷。", file=sys.stderr)


if __name__ == "__main__":
    main()
