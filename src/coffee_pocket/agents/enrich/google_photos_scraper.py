"""Google Maps photos scraper (Playwright).

Why this exists: Google Places API only returns ~10 photo references but each
costs an API call to fetch and they expire. We want a stable per-cafe gallery
mirrored to our own R2 bucket. This scraper opens the photos page reached by
clicking the side-panel cover image, sweeps the「全部」tab for 15 photos in
order, uploads them all to R2, and writes them back:

  - cafes.cover_image_url ← the first photo (the Google Maps cover)
  - cafes.photos          ← the next 14 photos as
        ``[{"url": <r2>, "source": "r2", "kind": "all"}, ...]``

Earlier drafts split the 15 between 「全部」and 「業主精選圖片」(owner picks),
but tab availability varies wildly per cafe (some have 0 owner photos, some
have 50+), so the simpler flat sweep gives a more consistent gallery.

Re-runs are idempotent — each photo lives at a deterministic key
``cafes/<place_id>/<idx>.webp`` so overwriting one position doesn't orphan
the others.

Usage:
    uv run python -m coffee_pocket.agents.enrich.google_photos_scraper --cafe-id <uuid>
    uv run python -m coffee_pocket.agents.enrich.google_photos_scraper --limit 5 --headful

Browser launch + login flow are shared with ``google_scraper`` — point both
modules at the same persistent profile (or storage_state JSON) and login once.

DOM landmarks (verified live via Claude in Chrome on zh-TW Google Maps — 2026-05;
classes are obfuscated so they WILL rotate, re-inspect when this breaks):
  - Side-panel cover → ``button.aoRNLd``.
  - Photos page tab bar → ``[role="tab"]`` items with ``data-tab-index="0..N"``.
    Active tab carries ``aria-selected="true"`` AND extra class ``G7m0Af``.
    Real tab text (zh-TW):「全部」「最新」「影片」「內部實景」(店家分類…)「業主精選圖片」「街景服務和 360 度相片」.
    There is NO「氛圍」tab — older spec drafts called it that; the actual
    owner-curated tab is「業主精選圖片」(sometimes shortened to「業主精選」).
  - Photo tile → ``div.aHpZye`` (outer) wrapped in ``a.MIgS0d``. The
    background-image is set via ``el.style`` programmatically, so
    ``el.getAttribute('style')`` returns ``null`` — we MUST use
    ``getComputedStyle(el).backgroundImage`` to extract the URL.
  - Photo tile URLs look like
    ``https://lh3.googleusercontent.com/gps-cs-s/<id>=w203-h152-k-no``.
    Strip everything from ``=`` onward to get a stable identity, then
    re-append ``=s1600`` at download time for full-res.
  - Scroll container → ``div.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde``; list is
    virtualized (~20 tiles at a time), so scrolling is required to load more.
"""

from __future__ import annotations

import argparse
import logging
import random
import re
from typing import Any

from playwright.sync_api import (
    Page,
    Playwright,
    TimeoutError as PWTimeout,
    sync_playwright,
)

from ...db import get_client
from ...storage import upload_cafe_photo
from .google_scraper import (
    AFTER_NAV_MS,
    AFTER_TAB_CLICK_MS,
    BETWEEN_CAFES_MS,
    SCROLL_PAUSE_MS,
    _launch_for_scrape,
    _sleep,
    _with_hl,
)

logger = logging.getLogger(__name__)

# Total photos to harvest from「全部」(includes the cover).
# Earlier versions split between「全部」and「業主精選圖片」(vibe) — but each cafe
# has wildly different tab availability (some have 0 owner-curated photos, some
# have 50), so we just grab a flat batch of 15 from「全部」which is guaranteed
# to exist on every place page.
TOTAL_PHOTOS = 15

# Frontend reads cafes.photos directly. The first photo doubles as the cover
# (also stored separately on cafes.cover_image_url), so the gallery list ends
# up with TOTAL_PHOTOS - 1 = 14 entries.
PHOTOS_LIST_LEN = TOTAL_PHOTOS - 1


def _open_photo_gallery(page: Page) -> None:
    """Click the side-panel cover image to enter the photos modal/page.

    Tries the place-panel cover button first (the same selector ``google_scraper``
    uses for hero_image); falls back to a generic '查看相片' / 'See photos' aria
    button. Waits for the photo tab bar to appear before returning.
    """
    candidates = [
        page.locator("button.aoRNLd").first,
        page.locator('button[aria-label*="相片"], button[aria-label*="photos"], button[aria-label*="Photos"]').first,
    ]
    for sel in candidates:
        try:
            sel.click(timeout=4000)
            break
        except (PWTimeout, Exception):
            continue
    else:
        raise RuntimeError("Could not find cover photo to open the gallery")

    # Tab bar appears once the gallery view has loaded.
    try:
        page.locator('[role="tab"]').first.wait_for(state="visible", timeout=15000)
    except PWTimeout:
        # Fallback: some layouts use buttons instead of role=tab.
        page.locator('button:has-text("全部"), button:has-text("All")').first.wait_for(
            state="visible", timeout=10000
        )


# --- Photo URL helpers ----------------------------------------------------

# Google's lh3 photo URL look like:
#   https://lh3.googleusercontent.com/p/AF1QipN...=w408-h306-k-no
# The leading path (everything before the `=`) is the stable identifier for
# the underlying photo. We dedupe on this key so different rendered sizes of
# the same photo collapse into one entry.
def _photo_key(url: str) -> str:
    return url.split("=", 1)[0]


def _is_cafe_photo_url(url: str) -> bool:
    """Heuristic: must be a Google user-content URL pointing at a place photo,
    not an avatar / icon / map tile."""
    if "googleusercontent.com" not in url:
        return False
    # Profile avatars live under /a/ or /a-/. Skip them.
    if "/a/" in url or "/a-/" in url:
        return False
    return True


def _collect_photo_urls(page: Page, want: int) -> list[str]:
    """Scroll the gallery list and harvest up to `want` photo URLs.

    Photo tiles are ``div.aHpZye`` (verified live on zh-TW Google Maps). Their
    background-image is set via ``el.style.backgroundImage`` directly — it
    does NOT appear in the inline ``style`` attribute, so the only way to read
    it is via ``getComputedStyle``. The previous version of this scraper
    queried ``[style*="background-image"]`` and got back zero tiles, which is
    why the "全部" tab only ever yielded the first 3 photos (the ones whose
    ``<img>`` thumbnails happened to be on screen).

    The list is virtualized (~20 tiles in DOM at any time, even though the
    scroller is ~10000px tall), so we keep scrolling until we've collected
    enough unique photo IDs.
    """
    seen: list[str] = []
    seen_set: set[str] = set()
    no_progress = 0
    max_idle = 6

    while len(seen) < want and no_progress < max_idle:
        urls: list[str] = page.evaluate(
            """() => {
                // Photo tiles: div.aHpZye, occasionally also div.gCPOGf (inner).
                // We grab both shapes to be defensive against future tweaks.
                const tiles = document.querySelectorAll('div.aHpZye, div.gCPOGf');
                const out = [];
                const seen = new Set();
                for (const el of tiles) {
                    const bg = getComputedStyle(el).backgroundImage;
                    if (!bg) continue;
                    const m = bg.match(/url\\(['\"]?(https:[^'\")]+)/);
                    if (!m) continue;
                    const u = m[1];
                    if (!u.includes('googleusercontent.com')) continue;
                    if (u.includes('/a/') || u.includes('/a-/')) continue; // avatars
                    if (seen.has(u)) continue;
                    seen.add(u);
                    out.push(u);
                }
                return out;
            }"""
        )

        added = 0
        for u in urls:
            if not _is_cafe_photo_url(u):
                continue
            key = _photo_key(u)
            if key in seen_set:
                continue
            seen_set.add(key)
            seen.append(key)
            added += 1
            if len(seen) >= want:
                break

        if len(seen) >= want:
            break

        no_progress = 0 if added > 0 else no_progress + 1

        # Scroll the photo grid. The known scroller class chain is
        # `.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde` but classes rotate; fall back
        # to "tallest scrollable ancestor of a photo tile".
        page.evaluate(
            """() => {
                let scroller = document.querySelector('div.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde');
                if (!scroller) {
                    // Walk up from a tile to find a scrollable ancestor.
                    const tile = document.querySelector('div.aHpZye');
                    let p = tile && tile.parentElement;
                    while (p) {
                        const cs = getComputedStyle(p);
                        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll')
                            && p.scrollHeight > p.clientHeight + 20) {
                            scroller = p;
                            break;
                        }
                        p = p.parentElement;
                    }
                }
                if (scroller) {
                    scroller.scrollBy(0, scroller.clientHeight * 0.9);
                }
            }"""
        )
        _sleep(page, SCROLL_PAUSE_MS)

    return seen[:want]


def scrape_photos_for_cafe(page: Page, cafe: dict[str, Any]) -> dict[str, list[str]]:
    """Open one cafe's gallery and return ``{"all": [first 15 photos]}``.

    Returns a dict (rather than a bare list) so the shape stays compatible
    with callers/tests that already destructure ``result["all"]`` from the
    earlier multi-tab version.
    """
    place_id = cafe["google_place_id"]
    url = cafe.get("google_maps_url") or f"https://www.google.com/maps/place/?q=place_id:{place_id}"
    url = _with_hl(url)
    logger.info("→ %s  (%s)", cafe["name"], url)

    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    _sleep(page, AFTER_NAV_MS)

    _open_photo_gallery(page)
    _sleep(page, AFTER_TAB_CLICK_MS)

    # The photos page opens on「全部」by default — no need to click a tab.
    # We just sweep the grid for 15 photos.
    all_photos = _collect_photo_urls(page, TOTAL_PHOTOS)
    logger.info("  全部: collected %d/%d", len(all_photos), TOTAL_PHOTOS)

    return {"all": all_photos}


def arrange_photos(
    all_photos: list[str],
    _vibe_photos: list[str] | None = None,  # kept for back-compat with the test script
) -> tuple[str | None, list[dict[str, str]]]:
    """Split the harvested list into (cover, gallery items).

    The first photo becomes both ``cafes.cover_image_url`` AND would otherwise
    appear in the gallery — to avoid the cover showing twice, we strip it from
    the gallery list. The remaining up-to-14 entries land in ``cafes.photos``
    as ``{"src": "<google URL>", "tab": "all"}`` objects.
    """
    cover = all_photos[0] if all_photos else None
    ordered: list[dict[str, str]] = [
        {"src": src, "tab": "all"} for src in all_photos[1 : 1 + PHOTOS_LIST_LEN]
    ]
    return cover, ordered


def upload_and_persist(
    cafe_id: str,
    place_id: str,
    cover_src: str | None,
    photo_items: list[dict[str, str]],
) -> None:
    """Upload cover + list photos to R2 and write back to cafes.

    Writes only ``cover_image_url`` and ``photos`` — other columns are never
    touched. The ``photos`` value is a jsonb array of objects so we keep
    provenance (which tab the photo came from):

        [{"url": "...", "source": "r2", "kind": "all" | "vibe"}, ...]
    """
    payload: dict[str, Any] = {}

    if cover_src:
        from ...storage import upload_cafe_cover  # local import to avoid cycle
        cover_url = upload_cafe_cover(place_id, cover_src)
        if cover_url:
            payload["cover_image_url"] = cover_url

    photo_objs: list[dict[str, str]] = []
    for i, item in enumerate(photo_items):
        # index starts at 1 because slot 0 is conceptually the cover (we use
        # the legacy key for the cover; gallery slots get their own subdir).
        url = upload_cafe_photo(place_id, i + 1, item["src"])
        if url:
            photo_objs.append({"url": url, "source": "r2", "kind": item["tab"]})
    if photo_objs:
        payload["photos"] = photo_objs

    if not payload:
        logger.warning("  nothing uploaded for cafe=%s", cafe_id)
        return

    get_client().table("cafes").update(payload).eq("id", cafe_id).execute()
    logger.info(
        "  wrote cover=%s photos=%d to cafes row %s",
        "yes" if "cover_image_url" in payload else "no",
        len(photo_objs),
        cafe_id,
    )


def pick_photo_cafes(
    *,
    limit: int | None = None,
    cafe_id: str | None = None,
    cafe_ids: list[str] | None = None,
    rescrape: bool = False,
) -> list[dict[str, Any]]:
    """Select cafes that need the photo scrape.

    The criteria for photos are different from reviews: a cafe is "done"
    once its ``cafes.photos`` column is populated, NOT when a local review
    JSON exists. (Reusing ``google_scraper.pick_cafes`` was the previous
    bug — it filtered out every cafe that already had a reviews JSON, so
    bulk runs typically processed only the 1–2 newest cafes.)

    Behaviour:
      * ``cafe_id`` / ``cafe_ids`` → exact lookup, no skip filter applied.
      * Otherwise → all rows with a ``google_place_id`` that aren't
        ``not_found`` / ``duplicate_of``. By default skips rows where
        ``photos`` is already non-empty; pass ``rescrape=True`` to override.
      * ``limit`` clips after filtering, mirroring ``google_scraper``.
    """
    db = get_client()
    q = db.table("cafes").select(
        "id, name, address, google_place_id, google_maps_url, "
        "business_status, duplicate_of, photos"
    )
    if cafe_id:
        rows = q.eq("id", cafe_id).execute().data or []
        return rows
    if cafe_ids:
        rows = q.in_("id", cafe_ids).execute().data or []
        return rows

    rows: list[dict[str, Any]] = q.execute().data or []
    rows = [
        r for r in rows
        if r.get("google_place_id")
        and r.get("business_status") != "not_found"
        and not r.get("duplicate_of")
    ]
    if not rescrape:
        # `photos` is also populated by `google_scraper` as a 1-element list
        # holding just the hero image (``kind: "hero"``) — that doesn't count
        # as "already gallery-scraped". Only skip rows that have at least one
        # entry from our own gallery sweep (``kind: "all"``), which guarantees
        # the scrape has actually run.
        def _has_gallery(r: dict[str, Any]) -> bool:
            photos = r.get("photos") or []
            return any(
                isinstance(p, dict) and p.get("kind") == "all"
                for p in photos
            )
        rows = [r for r in rows if not _has_gallery(r)]
    if limit:
        rows = rows[:limit]
    return rows


def run(
    pw: Playwright,
    cafes: list[dict[str, Any]],
    *,
    headful: bool,
    dry_run: bool = False,
) -> None:
    context = _launch_for_scrape(pw, headful=headful)
    page = context.pages[0] if context.pages else context.new_page()
    try:
        for i, cafe in enumerate(cafes):
            if not cafe.get("google_place_id"):
                logger.warning("skip %s — no google_place_id", cafe["name"])
                continue
            try:
                result = scrape_photos_for_cafe(page, cafe)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Failed on cafe=%s: %s", cafe["name"], exc)
                continue
            cover, photos = arrange_photos(result["all"])
            if dry_run:
                logger.info("  [dry-run] cover=%s", cover)
                for idx, p in enumerate(photos):
                    logger.info("  [dry-run] photos[%d] tab=%s url=%s", idx, p["tab"], p["src"])
            else:
                upload_and_persist(cafe["id"], cafe["google_place_id"], cover, photos)
            if i + 1 < len(cafes):
                gap_ms = random.randint(*BETWEEN_CAFES_MS)
                logger.info("  …sleeping %.1fs before next cafe", gap_ms / 1000)
                page.wait_for_timeout(gap_ms)
    finally:
        context.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--cafe-id", type=str, default=None)
    parser.add_argument("--cafe-ids", type=str, default=None, help="逗號分隔的多個 cafe id")
    parser.add_argument("--headful", action="store_true")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只抓取並印出結果,不上傳 R2、不寫回資料庫(用於除錯/驗證選擇器)",
    )
    parser.add_argument(
        "--place-id",
        type=str,
        default=None,
        help="跳過資料庫查詢,直接給定 Google place_id 測試一間店",
    )
    parser.add_argument(
        "--url",
        type=str,
        default=None,
        help="跳過資料庫,直接給 Google Maps URL 測試一間店(與 --place-id 二擇一)",
    )
    parser.add_argument(
        "--rescrape",
        action="store_true",
        help="重新處理已經有 photos 的店家(預設會跳過已抓過的)",
    )
    args = parser.parse_args()

    # Test mode: skip DB picker entirely when given an explicit place_id / URL.
    if args.place_id or args.url:
        cafes = [{
            "id": "test",
            "name": args.place_id or args.url or "test",
            "google_place_id": args.place_id or "test",
            "google_maps_url": args.url,
        }]
        # An ad-hoc target almost always wants dry-run (no DB row to write).
        args.dry_run = True
        logger.info("Test mode (--place-id/--url): forcing --dry-run")
    else:
        cafes = pick_photo_cafes(
            limit=args.limit,
            cafe_id=args.cafe_id,
            cafe_ids=[c.strip() for c in args.cafe_ids.split(",")] if args.cafe_ids else None,
            rescrape=args.rescrape,
        )
    logger.info("Picked %d cafes for photo scrape", len(cafes))
    if not cafes:
        return
    with sync_playwright() as pw:
        run(pw, cafes, headful=args.headful, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
