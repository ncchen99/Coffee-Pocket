"""Interactive dedupe for cafe rows that differ only by name casing/whitespace.

Imports from different sources sometimes give us the same physical cafe twice
("BELONGINN" vs "belonginn", "A room" vs "A Room"). Hard-deleting risks
losing manual edits, so we mark the loser with ``duplicate_of`` pointing at
the canonical row and leave the data intact.

Usage:
    uv run python -m coffee_pocket.agents.dedupe_cafes              # dry-run, list groups
    uv run python -m coffee_pocket.agents.dedupe_cafes --apply      # interactive merge
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from typing import Any

from ..db import get_client


def _normalize(name: str) -> str:
    """Case-fold and collapse internal whitespace so 'A room' == 'A Room' == 'a  room'."""
    return re.sub(r"\s+", "", name or "").casefold()


def _score(row: dict[str, Any]) -> tuple[int, int, int, int]:
    """Heuristic for picking the default canonical row inside a duplicate group.

    Prefers (in order): has google_place_id, has photos, has business_hours,
    has a rating. Higher is better.
    """
    return (
        1 if row.get("google_place_id") else 0,
        1 if row.get("photos") else 0,
        1 if row.get("business_hours") else 0,
        1 if row.get("google_rating") is not None else 0,
    )


def _fmt(row: dict[str, Any]) -> str:
    bits = [row["name"]]
    if row.get("address"):
        bits.append(row["address"])
    flags = []
    if row.get("google_place_id"):
        flags.append("place_id")
    if row.get("photos"):
        flags.append("photos")
    if row.get("business_hours"):
        flags.append("hours")
    if row.get("google_rating") is not None:
        flags.append(f"★{row['google_rating']}")
    if row.get("business_status"):
        flags.append(row["business_status"])
    if flags:
        bits.append(f"[{', '.join(flags)}]")
    return "  ".join(bits)


def fetch_groups() -> list[list[dict[str, Any]]]:
    db = get_client()
    rows = (
        db.table("cafes")
        .select(
            "id, name, address, google_place_id, photos, business_hours, "
            "google_rating, business_status, duplicate_of"
        )
        .execute()
        .data
        or []
    )
    rows = [r for r in rows if not r.get("duplicate_of")]
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        groups[_normalize(r["name"])].append(r)
    return [g for g in groups.values() if len(g) > 1]


def list_groups(groups: list[list[dict[str, Any]]]) -> None:
    if not groups:
        print("沒有發現名字疑似重複的店家。")
        return
    print(f"找到 {len(groups)} 組疑似重複：\n")
    for i, group in enumerate(groups, 1):
        print(f"[{i}] {len(group)} rows — '{group[0]['name']}'")
        for r in sorted(group, key=_score, reverse=True):
            print(f"    - {r['id']}  {_fmt(r)}")
        print()


def apply_dedupe(groups: list[list[dict[str, Any]]]) -> None:
    db = get_client()
    for i, group in enumerate(groups, 1):
        ranked = sorted(group, key=_score, reverse=True)
        default_idx = 1  # 1-based after re-rank
        print(f"\n=== Group {i}/{len(groups)} — '{group[0]['name']}' ===")
        for idx, r in enumerate(ranked, 1):
            marker = " (default)" if idx == default_idx else ""
            print(f"  {idx}{marker}  {r['id']}  {_fmt(r)}")
        choice = input(
            f"保留哪一個當 canonical? [1-{len(ranked)}] / s=skip / q=quit (Enter={default_idx}): "
        ).strip().lower()
        if choice == "q":
            print("中斷。")
            return
        if choice == "s":
            print("  跳過。")
            continue
        if choice == "":
            choice = str(default_idx)
        if not choice.isdigit() or not (1 <= int(choice) <= len(ranked)):
            print("  輸入無效，跳過。")
            continue
        keeper = ranked[int(choice) - 1]
        losers = [r for r in ranked if r["id"] != keeper["id"]]
        for loser in losers:
            db.table("cafes").update({"duplicate_of": keeper["id"]}).eq("id", loser["id"]).execute()
            print(f"  標記 {loser['id']} → duplicate_of {keeper['id']}")


def main() -> None:
    ap = argparse.ArgumentParser(description="標記名字大小寫造成的重複店家")
    ap.add_argument("--apply", action="store_true", help="互動式選 canonical 並寫入 duplicate_of")
    args = ap.parse_args()

    groups = fetch_groups()
    if not args.apply:
        list_groups(groups)
        if groups:
            print("（dry-run。加 --apply 進入互動模式實際標記。）")
        return
    if not groups:
        print("沒有發現名字疑似重複的店家。")
        return
    list_groups(groups)
    try:
        apply_dedupe(groups)
    except KeyboardInterrupt:
        print("\n中斷。", file=sys.stderr)


if __name__ == "__main__":
    main()
