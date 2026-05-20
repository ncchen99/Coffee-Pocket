"""Restore Cafe Nomad data for cafes lost in the dedup cleanup.

Background
----------
``cleanup_cafes`` deleted 87 rows; 86 had a ``cafe_nomad_id`` (Coffee Nomad
origin). 28 of those were ``duplicate_of`` another cafe — i.e. they were
the Coffee Nomad version of a store that already existed as a Google-
resolved row. The Coffee Nomad payload in ``reviews_raw`` (插座/安靜/座位
等 tag signals) cascaded away with them, so we lost the tag inputs for
those stores.

This script does two things, in order:

1. **Backfill** ``cafe_nomad_id`` onto the surviving canonical cafe. For
   each deleted dup row, we chase ``duplicate_of`` (handling chains and
   cycles) until we find a still-existing canonical. If that canonical
   has no ``cafe_nomad_id`` yet, we write the deleted row's
   ``cafe_nomad_id`` onto it.

2. **Re-import** Cafe Nomad records for those backfilled (and same-id
   already-existing) canonicals. We hit the public Tainan endpoint, then
   call the existing ``cafenomad.upsert_cafes`` with only the relevant
   subset, which will update the canonical cafe + create the
   ``reviews_raw`` row that the Semantic Agent consumes.

Cases reported but NOT auto-fixed:
- Canonical missing entirely (the chain dead-ended in another deleted
  row). Tag signals for those stores stay lost.
- Canonical already has a *different* ``cafe_nomad_id`` (3 known). We
  keep the existing one; the dup's payload is dropped to avoid
  clobbering whichever record is correct.

Usage:
    uv run python -m coffee_pocket.agents.maintenance.restore_dedup_cafe_nomad         # dry-run
    uv run python -m coffee_pocket.agents.maintenance.restore_dedup_cafe_nomad --apply # write
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

from ...db import get_client
from ..sources.cafenomad import fetch_tainan_cafes, upsert_cafes

logger = logging.getLogger(__name__)

BACKUP_PATH = Path("data/audit/deleted_cafes_backup.json")


def _resolve_canonical(
    start_id: str,
    backup_by_id: dict[str, dict[str, Any]],
    live_ids: set[str],
) -> str | None:
    """Walk duplicate_of chain until we land on a still-living cafe id.

    Returns the live canonical id, or None if the chain dead-ends in a
    deleted row.
    """
    seen: set[str] = set()
    cur = start_id
    while cur and cur not in seen:
        seen.add(cur)
        if cur in live_ids:
            return cur
        # cur was deleted; follow its duplicate_of pointer if any
        rec = backup_by_id.get(cur)
        if not rec:
            return None
        cur = rec.get("duplicate_of")
    return None


def run(*, apply: bool) -> None:
    if not BACKUP_PATH.exists():
        print(f"找不到備份 {BACKUP_PATH}", file=sys.stderr)
        sys.exit(1)

    backup: list[dict[str, Any]] = json.loads(BACKUP_PATH.read_text())
    backup_by_id = {r["id"]: r for r in backup}

    dup_rows = [r for r in backup if r.get("duplicate_of") and r.get("cafe_nomad_id")]
    print(f"backup 裡有 {len(dup_rows)} 筆 duplicate_of + cafe_nomad_id 的列")

    db = get_client()
    # All canonical-candidates we might end up looking up
    candidate_ids = {r["duplicate_of"] for r in dup_rows}
    rows = (
        db.table("cafes")
        .select("id, name, cafe_nomad_id")
        .in_("id", list(candidate_ids))
        .execute()
        .data
        or []
    )
    live_canonicals: dict[str, dict[str, Any]] = {r["id"]: r for r in rows}

    # Also probe deeper-chain canonicals (if first hop missing we resolve further).
    # Collect all ids we might need to know liveness for.
    all_chain_ids: set[str] = set()
    for r in dup_rows:
        cur = r.get("duplicate_of")
        depth = 0
        while cur and depth < 10:
            all_chain_ids.add(cur)
            rec = backup_by_id.get(cur)
            if not rec:
                break
            cur = rec.get("duplicate_of")
            depth += 1
    unknown = list(all_chain_ids - candidate_ids)
    if unknown:
        more = (
            db.table("cafes")
            .select("id, name, cafe_nomad_id")
            .in_("id", unknown)
            .execute()
            .data
            or []
        )
        for m in more:
            live_canonicals[m["id"]] = m

    live_ids = set(live_canonicals.keys())

    to_backfill: list[tuple[dict[str, Any], dict[str, Any]]] = []   # (dup_row, canonical_row)
    already_correct: list[tuple[dict[str, Any], dict[str, Any]]] = []
    cn_conflict: list[tuple[dict[str, Any], dict[str, Any]]] = []
    unrecoverable: list[dict[str, Any]] = []

    for dup in dup_rows:
        canonical_id = _resolve_canonical(dup["duplicate_of"], backup_by_id, live_ids)
        if not canonical_id:
            unrecoverable.append(dup)
            continue
        canon = live_canonicals[canonical_id]
        canon_cn = canon.get("cafe_nomad_id")
        dup_cn = dup["cafe_nomad_id"]
        if not canon_cn:
            to_backfill.append((dup, canon))
        elif canon_cn == dup_cn:
            already_correct.append((dup, canon))
        else:
            cn_conflict.append((dup, canon))

    print(f"\n  ✓ 可回填 (canonical 還活著且沒 cafe_nomad_id): {len(to_backfill)}")
    for dup, canon in to_backfill:
        print(f"    - {dup['name']!r}  cn={dup['cafe_nomad_id']}  → canonical {canon['name']!r} ({canon['id']})")
    print(f"\n  = 已經一樣 (canonical 已有同一個 cafe_nomad_id): {len(already_correct)}")
    for dup, canon in already_correct:
        print(f"    - {dup['name']!r} ↔ {canon['name']!r}")
    print(f"\n  ! cafe_nomad_id 衝突 (canonical 已有不同的 cn_id，跳過): {len(cn_conflict)}")
    for dup, canon in cn_conflict:
        print(f"    - {dup['name']!r}  dup_cn={dup['cafe_nomad_id']}  canon={canon['name']!r}  canon_cn={canon['cafe_nomad_id']}")
    print(f"\n  ✗ 無法救回 (canonical 鏈也被刪光): {len(unrecoverable)}")
    for dup in unrecoverable:
        print(f"    - {dup['name']!r}  原 cafe_nomad_id={dup['cafe_nomad_id']}")

    if not apply:
        print("\n(dry-run; 加 --apply 才會寫入 + 拉 Cafe Nomad API)")
        return

    # ---- 1) backfill cafe_nomad_id onto live canonicals
    if to_backfill:
        print(f"\n回填 {len(to_backfill)} 筆 cafe_nomad_id…")
        for dup, canon in to_backfill:
            db.table("cafes").update({"cafe_nomad_id": dup["cafe_nomad_id"]}).eq("id", canon["id"]).execute()
        print("done.")

    # ---- 2) targeted Cafe Nomad re-import
    # The set of cafe_nomad_ids that should now resolve to a live cafe row.
    target_cn_ids = {dup["cafe_nomad_id"] for dup, _ in to_backfill + already_correct}
    if not target_cn_ids:
        print("\n沒有要重抓的 Cafe Nomad 紀錄。")
        return

    print(f"\n抓 Cafe Nomad Tainan API…")
    items = fetch_tainan_cafes()
    print(f"  全 Tainan {len(items)} 筆")
    subset = [it for it in items if it.get("id") in target_cn_ids]
    print(f"  目標 {len(target_cn_ids)} 筆 → API 找到 {len(subset)} 筆")
    missing_from_api = target_cn_ids - {it.get("id") for it in subset}
    if missing_from_api:
        print(f"  ⚠ {len(missing_from_api)} 筆在 Cafe Nomad API 已找不到:")
        for cn in missing_from_api:
            dup = next((d for d, _ in to_backfill + already_correct if d["cafe_nomad_id"] == cn), None)
            print(f"    - {cn}  ({dup['name'] if dup else '?'})")

    if not subset:
        print("沒有可寫入的資料。")
        return

    cafes_n, raw_n = upsert_cafes(subset)
    print(f"\n寫入完成: cafes upserted={cafes_n}, reviews_raw upserted={raw_n}")
    print("Semantic Agent 接下來會用 reviews_raw 補回 cafe_tags / tag_evidence。")


def main() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser(description="把備份裡 duplicate_of 的 Cafe Nomad 資料還回 canonical cafe")
    ap.add_argument("--apply", action="store_true", help="實際寫入 DB + 拉 Cafe Nomad API")
    args = ap.parse_args()
    try:
        run(apply=args.apply)
    except KeyboardInterrupt:
        print("\n中斷。", file=sys.stderr)


if __name__ == "__main__":
    main()
