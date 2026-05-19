"""Tainan cafes list importer.

Opens a shared Google Maps list (My Maps) in the persistent Chrome profile,
scrolls the left panel until all items are loaded, clicks each item to read
the place URL + name + address, and writes the result to a local JSON file.

By default the script DOES NOT write to Supabase — pass --write-db to upsert
into the `cafes` table after you've reviewed the JSON.

Usage:
  uv run python -m coffee_pocket.agents.tainan_list --headful
  uv run python -m coffee_pocket.agents.tainan_list --write-db
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.sync_api import (
    Page,
    Playwright,
    TimeoutError as PWTimeout,
    sync_playwright,
)

from ..db import get_client
from .google_scraper import _launch_persistent, _sleep, _with_hl

logger = logging.getLogger(__name__)

LIST_URL = "https://maps.app.goo.gl/pLfi7yMwkKo8gh2o9"
OUT_PATH = Path("data/tainan_list.json")

NO_PROGRESS_SCROLLS = 5
SCROLL_PAUSE_MS = (1200, 2200)
AFTER_CLICK_MS = (1500, 2800)


# ----- URL parsing --------------------------------------------------------

_FID_RE = re.compile(r"!1s(0x[0-9a-f]+:0x[0-9a-f]+)", re.IGNORECASE)
_PLACE_ID_RE = re.compile(r"!1[69]s(?:%2F|/)g(?:%2F|/)([A-Za-z0-9_]+)")  # /g/... encoded or raw
_LATLNG_RE = re.compile(r"@(-?\d+\.\d+),(-?\d+\.\d+),")


def parse_place_url(url: str) -> dict[str, Any]:
    out: dict[str, Any] = {"url": url, "fid": None, "place_id": None, "lat": None, "lng": None}
    if m := _FID_RE.search(url):
        out["fid"] = m.group(1)
    if m := _PLACE_ID_RE.search(url):
        out["place_id"] = m.group(1)
    if m := _LATLNG_RE.search(url):
        out["lat"] = float(m.group(1))
        out["lng"] = float(m.group(2))
    return out


# ----- Panel interaction --------------------------------------------------


ITEM_BTN_SEL = "button.SMP2wb.fHEb6e"
LIST_CONTAINER_SEL = ".m6QErb.DxyBCb.kA9KIf.dS8AEf"


def _list_item_count(page: Page) -> int:
    return page.evaluate(f"document.querySelectorAll('{ITEM_BTN_SEL}').length")


def _scroll_list_sentinel(page: Page) -> None:
    """Scroll the last child of the list container into view.

    My Maps shared lists lazy-load via an IntersectionObserver on a sentinel
    element at the end of the list — setting scrollTop directly doesn't fire
    it, but scrolling the sentinel into view does.
    """
    page.evaluate(
        f"""() => {{
            const sc = document.querySelector('{LIST_CONTAINER_SEL}');
            if (!sc) return;
            const last = sc.lastElementChild;
            if (last) last.scrollIntoView({{behavior: 'instant', block: 'end'}});
            sc.dispatchEvent(new WheelEvent('wheel', {{deltaY: 800, bubbles: true}}));
        }}"""
    )


def _load_all_items(page: Page) -> int:
    last = -1
    stale = 0
    while stale < NO_PROGRESS_SCROLLS:
        count = _list_item_count(page)
        logger.info("  list items loaded: %d", count)
        if count == last:
            stale += 1
        else:
            stale = 0
            last = count
        _scroll_list_sentinel(page)
        _sleep(page, SCROLL_PAUSE_MS)
    return last


def _wait_for_panel_url(page: Page, prev_url: str, timeout_ms: int = 8000) -> str:
    """Poll page.url until it changes from prev_url (the panel updates the URL)."""
    deadline = page.evaluate("Date.now()") + timeout_ms
    while page.evaluate("Date.now()") < deadline:
        cur = page.url
        if cur != prev_url and "/maps/" in cur:
            return cur
        page.wait_for_timeout(150)
    return page.url


def _read_card(page: Page, idx: int) -> dict[str, Any]:
    """Read name/rating/review_count from the nth list button without clicking."""
    return page.evaluate(
        f"""(i) => {{
            const b = document.querySelectorAll('{ITEM_BTN_SEL}')[i];
            if (!b) return null;
            const name = b.querySelector('.fontHeadlineSmall.rZF81c')?.textContent?.trim() || null;
            // Look for a rating span like "4.8" followed by "(390)" review count.
            const txt = (b.textContent || '').trim();
            const m = txt.match(/(\\d\\.\\d)\\((\\d[\\d,]*)\\)/);
            return {{
                name,
                rating: m ? parseFloat(m[1]) : null,
                review_count: m ? parseInt(m[2].replace(/,/g, ''), 10) : null,
                raw: txt.slice(0, 200),
            }};
        }}""",
        idx,
    )


def _read_panel_address(page: Page) -> str | None:
    return page.evaluate(
        """() => {
            const el = document.querySelector('button[data-item-id="address"]')
                   || document.querySelector('[aria-label^="地址"]')
                   || document.querySelector('[data-tooltip="複製地址"]');
            if (!el) return null;
            const lbl = el.getAttribute('aria-label') || '';
            return lbl.replace(/^地址[：:]\\s*/, '').trim() || el.textContent.trim() || null;
        }"""
    )


def collect_list(page: Page) -> list[dict[str, Any]]:
    page.goto(_with_hl(LIST_URL))
    _sleep(page, (4500, 6500))

    # Force zh-TW: short-URL redirect strips hl. Re-navigate with hl appended.
    current = page.url
    if "hl=" not in current:
        try:
            page.goto(_with_hl(current))
            _sleep(page, (2500, 4000))
        except Exception:
            pass

    total = _load_all_items(page)
    logger.info("Found %d list items; clicking each…", total)

    results: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    for idx in range(total):
        card = _read_card(page, idx)
        if not card:
            logger.warning("  [%d] card missing, skipping", idx)
            continue
        item = page.locator(ITEM_BTN_SEL).nth(idx)
        try:
            item.scroll_into_view_if_needed(timeout=3000)
            prev = page.url
            item.click(timeout=4000)
        except PWTimeout:
            logger.warning("  [%d] click timeout (name=%s)", idx, card["name"])
            continue

        _sleep(page, AFTER_CLICK_MS)
        new_url = _wait_for_panel_url(page, prev)
        info = parse_place_url(new_url)
        address = _read_panel_address(page)
        record = {
            "index": idx,
            "name": card["name"],
            "rating": card["rating"],
            "review_count": card["review_count"],
            "address": address,
            **info,
        }
        if new_url in seen_urls:
            logger.warning("  [%d] URL did not change after click — same as previous", idx)
        seen_urls.add(new_url)
        results.append(record)
        logger.info(
            "  [%d/%d] %s  fid=%s  place_id=%s",
            idx + 1, total, record["name"], info["fid"], info["place_id"],
        )

    return results


# ----- DB write -----------------------------------------------------------


def upsert_to_supabase(records: list[dict[str, Any]]) -> int:
    client = get_client()
    written = 0
    for r in records:
        if not r.get("name") or r.get("lat") is None or r.get("lng") is None:
            logger.warning("skip incomplete: %s", r.get("name"))
            continue
        # PostGIS expects WKT; supabase-py serializes via PostgREST so we use ST_SetSRID via RPC if needed.
        # Simpler path: insert lat/lng as text WKT — supports POINT(lng lat).
        payload = {
            "name": r["name"],
            "address": r.get("address"),
            "google_maps_url": r.get("url"),
            "google_place_id": r.get("place_id"),
            "location": f"SRID=4326;POINT({r['lng']} {r['lat']})",
        }
        try:
            client.table("cafes").upsert(payload, on_conflict="google_place_id").execute()
            written += 1
        except Exception as exc:  # noqa: BLE001
            logger.exception("upsert failed for %s: %s", r["name"], exc)
    return written


# ----- Entry point --------------------------------------------------------


def run(pw: Playwright, *, headful: bool) -> list[dict[str, Any]]:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    context = _launch_persistent(pw, headful=headful)
    page = context.pages[0] if context.pages else context.new_page()
    try:
        records = collect_list(page)
    finally:
        context.close()

    OUT_PATH.write_text(
        json.dumps(
            {
                "source_url": LIST_URL,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "count": len(records),
                "items": records,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    logger.info("Wrote %s (%d items)", OUT_PATH, len(records))
    return records


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--headful", action="store_true", default=True, help="Show browser (default true)")
    parser.add_argument("--headless", dest="headful", action="store_false")
    parser.add_argument(
        "--write-db",
        action="store_true",
        help="After scraping, upsert results into the cafes table",
    )
    parser.add_argument(
        "--from-json",
        action="store_true",
        help="Skip scraping; upsert from existing data/tainan_list.json",
    )
    args = parser.parse_args()

    if args.from_json:
        if not OUT_PATH.exists():
            raise SystemExit(f"{OUT_PATH} not found — run without --from-json first")
        data = json.loads(OUT_PATH.read_text(encoding="utf-8"))
        records = data.get("items", [])
    else:
        with sync_playwright() as pw:
            records = run(pw, headful=args.headful)

    if args.write_db:
        n = upsert_to_supabase(records)
        logger.info("Upserted %d cafes", n)


if __name__ == "__main__":
    main()
