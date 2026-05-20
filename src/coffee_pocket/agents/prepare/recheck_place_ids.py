"""Re-resolve every cafe's place_id with the stricter find_place logic.

Why a second pass is needed
---------------------------
The original resolve_place_id ran with a loose query and accepted whatever
Text Search returned first — so a lot of place_ids in the DB point at a
nearby coffee shop rather than the actual store. Audit confirmed many
sub-0.5 similarity matches.

What this script does
---------------------
For each cafe (except those with non-Google place_ids and those already
marked ``not_found`` / ``duplicate_of``):

1. Call the new ``find_place(name, address)`` which:
   - queries ``"<name> <address>"`` first
   - rejects matches whose name doesn't resemble the input

2. Apply two collision checks against the in-memory snapshot of the DB:
   - **place_id collision**: another row already owns this place_id →
     mark current row ``duplicate_of`` that row.
   - **name collision**: another row's name normalizes to Google's
     canonical ``displayName`` → also a duplicate.

3. Otherwise: overwrite ``name`` with Google's ``displayName``, write
   ``google_place_id`` + ``google_maps_url`` + ``business_status``.

4. If find_place returns None → mark ``business_status='not_found'``.

The snapshot is updated after each write so collisions inside this batch
also get caught.

Usage:
    uv run python -m coffee_pocket.agents.prepare.recheck_place_ids               # dry-run
    uv run python -m coffee_pocket.agents.prepare.recheck_place_ids --limit 10    # dry-run on a few
    uv run python -m coffee_pocket.agents.prepare.recheck_place_ids --apply       # actually write
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from typing import Any

from ...db import get_client
from ..shared.places_lookup import _normalize_name, find_place

logger = logging.getLogger(__name__)

# Real Google place_ids are ~27 chars, typically start with ChIJ/0x/EhX/Ei…
# Anything notably shorter is a legacy / external id (e.g. cafe nomad import)
# that the user said to leave alone.
_MIN_REAL_PLACE_ID_LEN = 20

_API_STATUS_MAP = {
    "OPERATIONAL": "operational",
    "CLOSED_TEMPORARILY": "temporarily_closed",
    "CLOSED_PERMANENTLY": "permanently_closed",
}


def _looks_like_google_place_id(pid: str | None) -> bool:
    return bool(pid) and len(pid) >= _MIN_REAL_PLACE_ID_LEN


def _build_indexes(rows: list[dict[str, Any]]) -> tuple[dict[str, str], dict[str, str]]:
    """Return (place_id → row_id) and (normalized_name → row_id) maps."""
    by_pid: dict[str, str] = {}
    by_name: dict[str, str] = {}
    for r in rows:
        pid = r.get("google_place_id")
        if pid:
            by_pid.setdefault(pid, r["id"])
        norm = _normalize_name(r.get("name") or "")
        if norm:
            by_name.setdefault(norm, r["id"])
    return by_pid, by_name


def run(*, apply: bool, limit: int | None, sleep_ms: int, include_short_pids: bool, only_missing_pid: bool = False) -> None:
    db = get_client()
    rows: list[dict[str, Any]] = (
        db.table("cafes")
        .select("id, name, address, google_place_id, google_maps_url, business_status, duplicate_of")
        .execute()
        .data
        or []
    )

    # Include rows missing place_id (they need resolving) AND rows with a
    # real-looking Google place_id (those got re-resolved against the loose
    # logic and may be wrong). Legacy short ids (e.g. cafe_nomad imports) are
    # skipped by default but re-resolving them is the way to surface dupes
    # against canonical Google rows — opt in via --include-short-pids.
    def _keep(r: dict[str, Any]) -> bool:
        if r.get("business_status") == "not_found" or r.get("duplicate_of"):
            return False
        pid = r.get("google_place_id")
        if not pid:
            return True
        if only_missing_pid:
            return False
        if _looks_like_google_place_id(pid):
            return True
        return include_short_pids

    targets = [r for r in rows if _keep(r)]

    if limit:
        targets = targets[:limit]

    by_pid, by_name = _build_indexes(rows)

    mode = "APPLY" if apply else "DRY-RUN"
    print(f"[{mode}] re-resolving {len(targets)} cafes (of {len(rows)} total)\n")

    counters = {
        "renamed": 0,           # place_id matched ours, only name got updated
        "newly_resolved": 0,    # got a place_id, none collision
        "dup_by_place_id": 0,
        "dup_by_name": 0,
        "not_found": 0,
        "unchanged": 0,         # exact same place_id + name already
    }
    suspicious: list[tuple[dict[str, Any], dict[str, Any]]] = []

    for i, row in enumerate(targets, 1):
        our_name = row.get("name") or ""
        our_pid = row.get("google_place_id")
        place = find_place(our_name, row.get("address"))

        if not place:
            print(f"  [{i}/{len(targets)}] ✗ not_found: {our_name!r}")
            counters["not_found"] += 1
            if apply:
                db.table("cafes").update({"business_status": "not_found"}).eq("id", row["id"]).execute()
            if sleep_ms:
                time.sleep(sleep_ms / 1000)
            continue

        new_pid = place.get("id")
        new_name = (place.get("displayName") or {}).get("text") or our_name
        new_uri = place.get("googleMapsUri")
        new_norm = _normalize_name(new_name)

        # ---- Collision: place_id already owned by a *different* row
        pid_owner = by_pid.get(new_pid)
        if pid_owner and pid_owner != row["id"]:
            print(f"  [{i}/{len(targets)}] ⊕ dup-by-place_id: {our_name!r} → {new_name!r} (canonical {pid_owner})")
            counters["dup_by_place_id"] += 1
            if apply:
                db.table("cafes").update({"duplicate_of": pid_owner}).eq("id", row["id"]).execute()
            if sleep_ms:
                time.sleep(sleep_ms / 1000)
            continue

        # ---- Collision: another row already has the canonical name
        name_owner = by_name.get(new_norm)
        if name_owner and name_owner != row["id"]:
            print(f"  [{i}/{len(targets)}] ⊕ dup-by-name: {our_name!r} → {new_name!r} (canonical {name_owner})")
            counters["dup_by_name"] += 1
            if apply:
                db.table("cafes").update({"duplicate_of": name_owner}).eq("id", row["id"]).execute()
            if sleep_ms:
                time.sleep(sleep_ms / 1000)
            continue

        # ---- No collisions. Decide: unchanged / renamed / newly resolved.
        payload: dict[str, Any] = {}
        if new_pid != our_pid:
            payload["google_place_id"] = new_pid
            payload["google_maps_url"] = new_uri
        if new_name != our_name:
            payload["name"] = new_name
        api_status = place.get("businessStatus")
        if api_status and (mapped := _API_STATUS_MAP.get(api_status)):
            if mapped != row.get("business_status"):
                payload["business_status"] = mapped

        if not payload:
            counters["unchanged"] += 1
            print(f"  [{i}/{len(targets)}] = unchanged: {our_name!r}")
        else:
            if our_pid and new_pid == our_pid:
                counters["renamed"] += 1
                tag = "↻ renamed"
            else:
                counters["newly_resolved"] += 1
                tag = "✓ resolved"
            changes = ", ".join(f"{k}={v!r}" for k, v in payload.items())
            print(f"  [{i}/{len(targets)}] {tag}: {our_name!r} → {new_name!r}  [{changes}]")
            if apply:
                db.table("cafes").update(payload).eq("id", row["id"]).execute()
            # Update in-memory indexes so later rows in this batch see the new state.
            old_norm = _normalize_name(our_name)
            if old_norm in by_name and by_name[old_norm] == row["id"]:
                del by_name[old_norm]
            by_name[new_norm] = row["id"]
            by_pid[new_pid] = row["id"]

        if sleep_ms:
            time.sleep(sleep_ms / 1000)

    print("\n--- Summary ---")
    for k, v in counters.items():
        print(f"  {k:20s} {v}")
    if not apply:
        print("\n(dry-run; nothing written. 加 --apply 寫入。)")


def main() -> None:
    logging.basicConfig(
        level=logging.WARNING,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    ap = argparse.ArgumentParser(description="重抓所有咖啡廳的 place_id，用 Google 官方名字替換並偵測重複")
    ap.add_argument("--apply", action="store_true", help="實際寫入 DB（不加就只 dry-run）")
    ap.add_argument("--limit", type=int, default=None, help="只跑前 N 筆")
    ap.add_argument("--sleep-ms", type=int, default=80, help="每次 API call 之間 sleep")
    ap.add_argument(
        "--include-short-pids",
        action="store_true",
        help="也重抓短 place_id 的列 (legacy cafe_nomad 等)；預設只跳過",
    )
    ap.add_argument(
        "--only-missing-pid",
        action="store_true",
        help="只處理沒有 google_place_id 的列（用來只跑新插入的 cafe）",
    )
    args = ap.parse_args()

    try:
        run(
            apply=args.apply,
            limit=args.limit,
            sleep_ms=args.sleep_ms,
            include_short_pids=args.include_short_pids,
            only_missing_pid=args.only_missing_pid,
        )
    except KeyboardInterrupt:
        print("\n中斷。", file=sys.stderr)


if __name__ == "__main__":
    main()
