"""Populate ``cafes.name_pinyin`` and ``cafes.slug`` for rows missing them.

Why
---
Postgres has no native Chinese-pinyin function, so we precompute pinyin
(toneless lowercased Hanyu Pinyin) and a URL-friendly slug here and store
them on the row. The frontend converts the user's search query with
``pinyin-pro`` and the RPC matches against ``name_pinyin`` — this lets
"黑浮" find a cafe called "黑福" because both map to ``heifu``.

What ``name_pinyin`` looks like
-------------------------------
* Hanyu Pinyin, no tones, no diacritics, lowercased
* Spaces between syllables, plus a concatenated copy (improves ILIKE recall)
* Non-CJK chars (English, digits) are kept verbatim and lowercased

  ``黑浮咖啡`` → ``"hei fu ka fei heifukafei"``
  ``A Room`` → ``"a room"``

Slug
----
* kebab-case pinyin (or original ASCII), e.g. ``hei-fu-ka-fei``
* unique across the table — duplicates get ``-2`` / ``-3`` suffixes
* used for SEO-friendly URLs later

Usage
-----
::

    uv run python -m coffee_pocket.agents.prepare.generate_pinyin             # dry-run
    uv run python -m coffee_pocket.agents.prepare.generate_pinyin --apply     # write
    uv run python -m coffee_pocket.agents.prepare.generate_pinyin --all       # re-generate everything (with --apply to write)
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from typing import Any

from pypinyin import Style, lazy_pinyin

from ...db import get_client


def to_pinyin(name: str) -> str:
    """Convert a cafe name to space-separated toneless pinyin + concatenated form.

    Non-CJK characters (Latin letters, digits, &, etc.) are passed through
    lowercased. The result combines space-form and concatenated form so an
    ILIKE substring search hits whether the user types ``heifu`` or
    ``hei fu``.
    """
    if not name:
        return ""
    # lazy_pinyin keeps non-Han chars as-is; Style.NORMAL = no tones.
    syllables = lazy_pinyin(name, style=Style.NORMAL, errors="default")
    cleaned = [s.lower().strip() for s in syllables if s and s.strip()]
    spaced = " ".join(cleaned)
    concat = "".join(cleaned)
    # Keep both forms so substring search hits either way.
    if spaced == concat:
        return spaced
    return f"{spaced} {concat}"


def to_slug_base(name: str) -> str:
    """Build the slug stem (before uniqueness suffix)."""
    if not name:
        return ""
    syllables = lazy_pinyin(name, style=Style.NORMAL, errors="default")
    parts: list[str] = []
    for s in syllables:
        s = unicodedata.normalize("NFKD", s)
        s = "".join(c for c in s if not unicodedata.combining(c))
        s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
        if s:
            parts.append(s)
    slug = "-".join(parts)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "cafe"


def _existing_slugs(cl) -> set[str]:
    """Pull current slugs so we can avoid collisions."""
    out: set[str] = set()
    offset = 0
    page = 1000
    while True:
        rows = (
            cl.table("cafes")
            .select("slug")
            .not_.is_("slug", "null")
            .range(offset, offset + page - 1)
            .execute()
            .data
            or []
        )
        for r in rows:
            if r.get("slug"):
                out.add(r["slug"])
        if len(rows) < page:
            break
        offset += page
    return out


def _fetch_targets(cl, all_rows: bool) -> list[dict[str, Any]]:
    q = cl.table("cafes").select("id, name, name_pinyin, slug, duplicate_of").order("created_at")
    if not all_rows:
        q = q.or_("name_pinyin.is.null,slug.is.null")
    rows = q.execute().data or []
    # Skip duplicates — they shouldn't surface in search anyway.
    return [r for r in rows if not r.get("duplicate_of")]


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill name_pinyin + slug on cafes.")
    ap.add_argument("--apply", action="store_true", help="actually write to DB (default: dry-run)")
    ap.add_argument("--all", action="store_true", help="regenerate for every cafe, not just missing ones")
    ap.add_argument("--limit", type=int, default=None, help="cap the number of rows processed")
    args = ap.parse_args()

    cl = get_client()
    targets = _fetch_targets(cl, all_rows=args.all)
    if args.limit:
        targets = targets[: args.limit]

    if not targets:
        print("nothing to do")
        return

    existing_slugs = _existing_slugs(cl) if args.apply else set()
    # Track slugs we've assigned in this run so a single batch doesn't collide internally.
    used_slugs = set(existing_slugs)

    updates = 0
    for row in targets:
        name = row.get("name") or ""
        pinyin = to_pinyin(name)
        base_slug = to_slug_base(name)
        slug = base_slug
        n = 2
        while slug in used_slugs and slug != row.get("slug"):
            slug = f"{base_slug}-{n}"
            n += 1
        used_slugs.add(slug)

        before = (row.get("name_pinyin"), row.get("slug"))
        after = (pinyin, slug)
        if before == after:
            continue

        print(f"  {name!r:40} → pinyin={pinyin!r:50} slug={slug!r}")
        updates += 1

        if args.apply:
            cl.table("cafes").update({"name_pinyin": pinyin, "slug": slug}).eq("id", row["id"]).execute()

    print(f"\n{updates} row(s) {'updated' if args.apply else 'would be updated (dry-run)'}")
    if not args.apply:
        print("re-run with --apply to write.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
