"""Google Maps reviews scraper (Playwright).

Why this exists: Google Places API v1 returns at most ~5 reviews per place, which
is insufficient signal density for our Semantic Layer. This scraper opens the
Google Maps web UI, sorts by newest, scrolls the reviews panel, expands truncated
text, and saves all collected reviews to a local JSON file per cafe.

Stop conditions (whichever hits first):
  - Collected >= MAX_REVIEWS (default 100)
  - Encountered a review older than MAX_AGE_DAYS (default 365)
  - No new reviews after several scroll attempts (panel exhausted)

Output:
  data/reviews/<google_place_id>.json
  {
    "place_id": "...",
    "cafe_id": "<uuid>",
    "name": "...",
    "url": "<google_maps_url>",
    "fetched_at": "<iso>",
    "stop_reason": "max_reviews" | "max_age" | "exhausted",
    "meta": {
      "business_status": "operational" | "temporarily_closed" | "permanently_closed",
      "rating": 4.8, "review_count": 219,
      "category": "咖啡店", "price_level": "$200-400",
      "address": "...", "phone": "...", "website": "...",
      "menu_url": "...", "hero_image": "...",
      "business_hours": {"mon": ["closed"], "tue": ["19:30–23:30"],
                         "wed": ["11:00–14:30", "17:00–21:00"], ...},
      "open_status_text": "已打烊 · 開始營業時間：週三19:30"
    },
    "reviews": [ ... ]
  }

Usage:
  uv run python -m coffee_pocket.agents.enrich.google_scraper --limit 5
  uv run python -m coffee_pocket.agents.enrich.google_scraper --cafe-id <uuid> --headful
  uv run python -m coffee_pocket.agents.enrich.google_scraper --update-cafe  # write meta back to DB
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import random
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse, urlunparse, parse_qsl

from playwright.sync_api import (
    Locator,
    Page,
    Playwright,
    TimeoutError as PWTimeout,
    sync_playwright,
)

from ...db import get_client
from ...storage import upload_cafe_cover
from ..shared.places_lookup import find_place

logger = logging.getLogger(__name__)

OUT_DIR = Path("data/reviews")
AUTH_DIR = Path("data/.auth")
# Persistent Chrome profile dir — keeps cookies + localStorage between runs.
# Using a real Chrome channel (not bundled Chromium) so Google doesn't flag
# the browser as "insecure" during login.
USER_DATA_DIR = AUTH_DIR / "chrome-profile"
MAX_REVIEWS_DEFAULT = 100
MAX_AGE_DAYS_DEFAULT = 3650
NO_PROGRESS_LIMIT = 6  # consecutive scrolls with no new cards → stop

# Human-pace timing knobs (milliseconds). Real users don't scroll on a metronome,
# so every wait below picks a uniform random value in [min, max]. Keep these
# generous — we'd rather take an hour than get the account flagged.
SCROLL_PAUSE_MS = (2200, 4200)           # between feed scrolls
AFTER_NAV_MS = (3000, 5500)              # after opening a place URL
AFTER_TAB_CLICK_MS = (1500, 3000)        # after clicking 評論 tab
AFTER_SORT_MS = (2000, 4000)             # after picking 最新
BETWEEN_CAFES_MS = (20_000, 30_000)      # idle gap between cafes — shorter as requested
MICRO_PAUSE_MS = (200, 700)              # tiny think-time between sub-actions


def _sleep(page: Page, span: tuple[int, int]) -> None:
    """Wait a uniform-random duration within `span` (ms)."""
    lo, hi = span
    page.wait_for_timeout(random.randint(lo, hi))


def _with_hl(url: str, lang: str = "zh-TW") -> str:
    """Force Google's UI language by appending hl=<lang> to the query string.

    Why: even with Playwright's locale="zh-TW" and an Accept-Language header,
    a persistent Chrome profile that previously surfaced English will keep
    showing English (the profile cookie + account preference win). The hl
    query param is the override that always works.
    """
    parts = urlparse(url)
    qs = dict(parse_qsl(parts.query, keep_blank_values=True))
    qs.setdefault("hl", lang)
    return urlunparse(parts._replace(query=urlencode(qs)))


# ----- Relative-time parsing (zh-TW) --------------------------------------

_REL_PATTERNS = [
    (re.compile(r"(\d+)\s*年前"), lambda n: timedelta(days=365 * n)),
    (re.compile(r"(\d+)\s*個月前"), lambda n: timedelta(days=30 * n)),
    (re.compile(r"(\d+)\s*週前"), lambda n: timedelta(days=7 * n)),
    (re.compile(r"(\d+)\s*天前"), lambda n: timedelta(days=n)),
    (re.compile(r"(\d+)\s*小時前"), lambda n: timedelta(hours=n)),
    (re.compile(r"(\d+)\s*分鐘前"), lambda n: timedelta(minutes=n)),
]


def parse_relative_time(text: str | None) -> tuple[int, datetime] | None:
    """Return (age_days, approximate_posted_at_utc) or None if unparseable.

    Handles zh-TW relative-time strings as shown on Google Maps. "1 週前 (已編輯)"
    etc. → strips the parenthetical.
    """
    if not text:
        return None
    cleaned = re.sub(r"\(.*?\)", "", text).strip()
    if "昨天" in cleaned:
        delta = timedelta(days=1)
    elif "今天" in cleaned:
        delta = timedelta(hours=12)
    else:
        delta = None
        for pat, fn in _REL_PATTERNS:
            m = pat.search(cleaned)
            if m:
                delta = fn(int(m.group(1)))
                break
        if delta is None:
            return None
    now = datetime.now(timezone.utc)
    return delta.days, now - delta


# ----- Place metadata extraction ------------------------------------------
#
# Selectors verified live in Chrome MCP (2026-05) against:
#   - BELONGINN (永久歇業, no phone/hours/menu)
#   - Saki 咲咖啡 (暫時關閉, has phone/website but no hours)
#   - Abby coffee (operational, full hours)


_WEEKDAY_MAP = {
    "星期一": "mon", "星期二": "tue", "星期三": "wed", "星期四": "thu",
    "星期五": "fri", "星期六": "sat", "星期日": "sun",
    "Monday": "mon", "Tuesday": "tue", "Wednesday": "wed", "Thursday": "thu",
    "Friday": "fri", "Saturday": "sat", "Sunday": "sun",
}

_STATUS_MAP = {
    "永久歇業": "permanently_closed",
    "Permanently closed": "permanently_closed",
    "暫時關閉": "temporarily_closed",
    "暫停營業": "temporarily_closed",
    "Temporarily closed": "temporarily_closed",
}

# Places API businessStatus → our enum.
_API_STATUS_MAP = {
    "OPERATIONAL": "operational",
    "CLOSED_TEMPORARILY": "temporarily_closed",
    "CLOSED_PERMANENTLY": "permanently_closed",
}


_HOUR_RANGE_RE = re.compile(r"(\d{1,2}:\d{2})\s*(?:到|–|-|—|to)\s*(\d{1,2}:\d{2})")


def _parse_hours_aria(aria: str) -> tuple[str, list[str]] | None:
    """Parse a per-weekday aria-label into ``(key, segments)``.

    Examples (verified live):
      '星期二、19:30 到 23:30, 複製營業時間' → ('tue', ['19:30–23:30'])
      '星期三、11:00 到 14:30、17:00 到 21:00, 複製營業時間'
                                          → ('wed', ['11:00–14:30', '17:00–21:00'])
      '星期一、休息, 複製營業時間'           → ('mon', ['closed'])

    Returns None when no weekday prefix matches.
    """
    if not aria:
        return None
    for label, key in _WEEKDAY_MAP.items():
        if aria.startswith(label):
            rest = aria[len(label):].lstrip("、, ")
            # Drop the trailing ", 複製營業時間" / ", Copy hours" tail.
            rest = re.split(r",\s*(?:複製|Copy)", rest, maxsplit=1)[0]
            if "休息" in rest or "Closed" in rest:
                return key, ["closed"]
            segments = [
                f"{m.group(1)}–{m.group(2)}"
                for m in _HOUR_RANGE_RE.finditer(rest)
            ]
            if segments:
                return key, segments
            fallback = rest.split("、")[0].strip()
            return key, [fallback] if fallback else None
    return None


def extract_place_meta(page: Page) -> dict[str, Any]:
    """Read the place-panel metadata in a single JS pass.

    Called after the panel loads but before clicking the Reviews tab, because
    switching tabs replaces the side panel content with the review list.
    """
    raw = page.evaluate(
        """() => {
            const text = (el) => el?.textContent?.trim() || null;
            const attr = (el, a) => el?.getAttribute(a) || null;

            // Business-status badge — present only when closed.
            const statusBadge = text(document.querySelector('span.fCEvvc'));

            // Rating + review count from div.F7nice → aria-labels on its children.
            const ratingImg = document.querySelector('div.F7nice [role="img"][aria-label*="顆星"], div.F7nice [role="img"][aria-label*="star"]');
            const ratingLabel = attr(ratingImg, 'aria-label') || '';
            const rm = ratingLabel.match(/(\\d+(?:\\.\\d+)?)/);
            const reviewImg = document.querySelector('div.F7nice [role="img"][aria-label*="則評論"], div.F7nice [role="img"][aria-label*="review"]');
            const reviewLabel = attr(reviewImg, 'aria-label') || '';
            const rcm = reviewLabel.match(/([\\d,]+)/);

            // skqShb is the meta line: "4.8(219)·$200-400咖啡店·暫時關閉"
            // After removing rating/count, what's left is "·$price·category·status?"
            const meta = text(document.querySelector('div.skqShb')) || '';
            const metaParts = meta.replace(/^[\\d.]+\\(\\d[\\d,]*\\)/, '').split('·').map(s => s.trim()).filter(Boolean);
            // Heuristic: first part starting with '$' is the price band; first non-$, non-status part is category.
            let price = null, category = null;
            const statusSet = new Set(['永久歇業','暫時關閉','暫停營業','Permanently closed','Temporarily closed']);
            for (const p of metaParts) {
                if (statusSet.has(p)) continue;
                if (p.startsWith('$')) price = price || p;
                else category = category || p;
            }

            // Address / phone / website / menu — all data-item-id keyed.
            const addrBtn = document.querySelector('button[data-item-id="address"]');
            const address = (attr(addrBtn, 'aria-label') || '').replace(/^地址[：:]\\s*/, '').replace(/^Address[：:]\\s*/, '').trim() || text(addrBtn);
            const phoneBtn = document.querySelector('button[data-item-id^="phone:"]');
            const phone = (attr(phoneBtn, 'aria-label') || '').replace(/^電話號碼[：:]\\s*/, '').replace(/^Phone[：:]\\s*/, '').trim() || text(phoneBtn);
            const phoneDataId = attr(phoneBtn, 'data-item-id') || '';
            const website = attr(document.querySelector('a[data-item-id="authority"]'), 'href');
            const menuUrl = attr(document.querySelector('a[data-item-id="menu"]'), 'href');

            // Hero image — button.aoRNLd img (the place-panel cover photo).
            const heroImg = document.querySelector('button.aoRNLd img') || document.querySelector('button[aria-label$="的相片"] img, button[aria-label$=" photos"] img');
            const heroSrc = heroImg?.src || null;

            // Hours — one button.mWUh3d per weekday with aria-label.
            const hoursBtns = Array.from(document.querySelectorAll('button.mWUh3d'));
            const hoursAria = hoursBtns.map(b => attr(b, 'aria-label')).filter(Boolean);

            // Current open-state line (e.g. "已打烊 · 開始營業時間：週三19:30").
            const openStatusEl = document.querySelector('.OqCZI');
            const openStatusText = openStatusEl
                ? (openStatusEl.textContent || '').split('這個商家')[0].split('提供營業時間')[0].split(/\\s{2,}/)[0].trim().slice(0, 120)
                : null;

            return {
                statusBadge, address, phone, phoneDataId, website, menuUrl,
                category, price, heroSrc, hoursAria, openStatusText,
                rating: rm ? parseFloat(rm[1]) : null,
                reviewCount: rcm ? parseInt(rcm[1].replace(/,/g, ''), 10) : null,
            };
        }"""
    )

    # Map status badge → enum.
    status = _STATUS_MAP.get((raw.get("statusBadge") or "").strip(), "operational")

    # Parse hours. Each day maps to a list of segments to support split shifts
    # like ['11:00–14:30', '17:00–21:00']. Closed days → ['closed'].
    hours: dict[str, list[str]] = {}
    for a in raw.get("hoursAria") or []:
        parsed = _parse_hours_aria(a)
        if parsed:
            hours[parsed[0]] = parsed[1]

    # Strip phone "phone:tel:..." prefix if aria-label was missing.
    phone = raw.get("phone")
    if not phone and (pid := raw.get("phoneDataId")):
        phone = pid.split("tel:", 1)[-1] or None

    return {
        "business_status": status,
        "rating": raw.get("rating"),
        "review_count": raw.get("reviewCount"),
        "category": raw.get("category"),
        "price_level": raw.get("price"),
        "address": raw.get("address"),
        "phone": phone,
        "website": raw.get("website"),
        "menu_url": raw.get("menuUrl"),
        "hero_image": raw.get("heroSrc"),
        "business_hours": hours or None,
        "open_status_text": raw.get("openStatusText"),
    }


# ----- DOM helpers ---------------------------------------------------------


def _wait_reviews_panel(page: Page) -> None:
    """Click into the Reviews tab and wait for review cards to appear.

    DOM reality (verified live in Chrome DevTools, 2026-05): the reviews list
    is NOT inside a `role="feed"` container — that selector never matches.
    Cards are `[data-review-id]` elements; their closest scrollable ancestor
    is the side-panel div with `tabindex="-1"` and `overflow-y: auto`.
    """
    try:
        page.locator('h1').first.wait_for(state="visible", timeout=15000)
    except PWTimeout:
        pass

    tab_re = re.compile(r"評論|Reviews", re.IGNORECASE)
    selectors: list[Locator] = [
        page.get_by_role("tab", name=tab_re),
        page.locator('button[aria-label*="評論"], button[aria-label*="Reviews"]'),
        page.locator('[role="tab"][aria-label*="評論"], [role="tab"][aria-label*="Reviews"]'),
        page.get_by_text(re.compile(r"^(評論|Reviews)$")),
    ]
    for sel in selectors:
        try:
            sel.first.click(timeout=4000)
            break
        except (PWTimeout, Exception):
            continue

    try:
        page.locator('[data-review-id]').first.wait_for(state="visible", timeout=20000)
    except PWTimeout:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        shot = OUT_DIR / "_debug_no_feed.png"
        try:
            page.screenshot(path=str(shot), full_page=True)
            logger.error("Review cards never appeared — screenshot at %s", shot)
        except Exception:
            pass
        raise


def _scroll_reviews(page: Page, ratio: float) -> None:
    """Scroll the side-panel container that holds the review cards.

    Belt + braces:
      1. ``scrollIntoView`` the LAST card with ``block:'end'`` — forces the
         panel to extend even when our overflow-ancestor heuristic picks the
         wrong element.
      2. Walk up from a card to the nearest ancestor whose ``overflow-y`` is
         ``auto`` *or* ``scroll`` (Google uses both depending on viewport
         width) and ``scrollBy`` an extra chunk so Google's infinite-scroll
         observer fires.
    """
    page.evaluate(
        """(r) => {
            const cards = document.querySelectorAll('[data-review-id]');
            if (!cards.length) return;
            const last = cards[cards.length - 1];
            try { last.scrollIntoView({block: 'end', behavior: 'instant'}); } catch (e) {}
            let p = last.parentElement;
            while (p) {
                const oy = getComputedStyle(p).overflowY;
                if (oy === 'auto' || oy === 'scroll') break;
                p = p.parentElement;
            }
            if (p) p.scrollBy(0, p.clientHeight * r);
        }""",
        ratio,
    )


def _sort_by_newest(page: Page) -> None:
    """Open the sort menu and pick '最新' (data-index="1")."""
    # Verified: sort button has aria-label="排序評論", text "排序".
    try:
        page.locator('button[aria-label*="排序"], button[aria-label*="Sort"]').first.click(timeout=3000)
    except PWTimeout:
        logger.warning("Sort button not found — reviews will be in default order")
        return

    # Menu items are role="menuitemradio" with data-index: 0=最相關, 1=最新,
    # 2=評分最高, 3=評分最低. data-index is more stable than the label text.
    try:
        page.locator('[role="menuitemradio"][data-index="1"]').click(timeout=3000)
        return
    except PWTimeout:
        pass
    try:
        page.get_by_role("menuitemradio", name=re.compile(r"最新|Newest")).click(timeout=3000)
    except PWTimeout:
        logger.warning("Could not find '最新' / 'Newest' option")


def _expand_more_buttons(page: Page) -> int:
    """Click all visible 'More' / '更多' buttons on review cards.

    Verified: the truncation toggle is a <button> with aria-label="顯示更多"
    and inner text "更多". We expand all of them in a single JS pass so we
    don't pay one round-trip per card.
    """
    return page.evaluate(
        """() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const targets = buttons.filter(b => {
                const txt = (b.textContent || '').trim();
                const aria = b.getAttribute('aria-label') || '';
                return txt === '更多' || txt === 'More' ||
                       aria === '顯示更多' || aria === 'Show more';
            });
            let n = 0;
            for (const b of targets) {
                try { b.click(); n++; } catch (e) {}
            }
            return n;
        }"""
    )


def _extract_all_cards(page: Page) -> list[dict[str, Any]]:
    """Extract every review card on the page in one JS pass.

    Doing this in JS avoids hundreds of Playwright round-trips per scroll cycle
    (each .locator().inner_text() is its own IPC). Selectors verified live:
        .d4r55  → author name
        .rsqaWe → relative time ("3 個月前")
        .wiI7pd → review body text
        [aria-label*="顆星"] → star rating
    """
    return page.evaluate(
        """() => {
            const cards = document.querySelectorAll('[data-review-id]');
            return Array.from(cards).map(c => {
                const author = c.querySelector('.d4r55')?.textContent?.trim() || null;
                const time = c.querySelector('.rsqaWe')?.textContent?.trim() || null;
                const text = c.querySelector('.wiI7pd')?.textContent?.trim() || '';
                const ratingEl = c.querySelector('[aria-label*="顆星"], [aria-label*="star"]');
                const ratingLabel = ratingEl?.getAttribute('aria-label') || '';
                const m = ratingLabel.match(/(\\d+)/);
                return {
                    review_id: c.getAttribute('data-review-id'),
                    author,
                    rating: m ? parseInt(m[1], 10) : null,
                    relative_time: time,
                    text,
                };
            });
        }"""
    )


def _stable_id(place_id: str, card: dict[str, Any]) -> str:
    """Synthesize a stable external_id from (place_id, author, relative_time, text-prefix).

    Google Maps doesn't expose review IDs in the DOM easily; this hash is stable
    enough for upserts to be idempotent across re-runs (unless the user edits
    their review text).
    """
    h = hashlib.sha1()
    h.update(place_id.encode("utf-8"))
    h.update(b"|")
    h.update((card.get("author") or "").encode("utf-8"))
    h.update(b"|")
    h.update((card.get("relative_time") or "").encode("utf-8"))
    h.update(b"|")
    h.update((card.get("text") or "")[:80].encode("utf-8"))
    return "gmaps_" + h.hexdigest()[:20]


# ----- Scrape one cafe -----------------------------------------------------


def scrape_one(
    page: Page,
    cafe: dict[str, Any],
    *,
    max_reviews: int,
    max_age_days: int,
) -> dict[str, Any]:
    place_id = cafe["google_place_id"]
    url = cafe.get("google_maps_url") or f"https://www.google.com/maps/place/?q=place_id:{place_id}"
    url = _with_hl(url)
    logger.info("→ %s  (%s)", cafe["name"], url)

    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    _sleep(page, AFTER_NAV_MS)

    # Capture place-panel metadata BEFORE switching to the Reviews tab — the
    # side panel gets replaced when the Reviews tab opens.
    try:
        page.locator('h1').first.wait_for(state="visible", timeout=15000)
    except PWTimeout:
        pass
    meta = extract_place_meta(page)
    logger.info(
        "  meta: status=%s rating=%s reviews=%s price=%s phone=%s",
        meta["business_status"], meta["rating"], meta["review_count"],
        meta["price_level"], meta["phone"],
    )

    _wait_reviews_panel(page)
    _sleep(page, AFTER_TAB_CLICK_MS)
    _sort_by_newest(page)
    _sleep(page, AFTER_SORT_MS)

    collected: dict[str, dict[str, Any]] = {}  # keyed by review_id
    stop_reason = "exhausted"
    no_progress = 0

    while True:
        _expand_more_buttons(page)

        added_this_round = 0
        for data in _extract_all_cards(page):
            rid = data.get("review_id") or _stable_id(place_id, data)
            if rid in collected:
                continue
            parsed = parse_relative_time(data.get("relative_time"))
            if parsed:
                age_days, posted_at = parsed
                data["age_days"] = age_days
                data["posted_at_approx"] = posted_at.isoformat()
            else:
                data["age_days"] = None
                data["posted_at_approx"] = None
            data["external_id"] = rid
            collected[rid] = data
            added_this_round += 1

            if len(collected) >= max_reviews:
                stop_reason = "max_reviews"
                break
            if data["age_days"] is not None and data["age_days"] > max_age_days:
                stop_reason = "max_age"
                break

        if stop_reason in ("max_reviews", "max_age"):
            break

        if added_this_round == 0:
            no_progress += 1
        else:
            no_progress = 0
        if no_progress >= NO_PROGRESS_LIMIT:
            stop_reason = "exhausted"
            break

        # Scroll the side-panel container — jitter so we don't look like a bot
        # cruising at constant velocity.
        _scroll_reviews(page, random.uniform(0.45, 0.85))
        _sleep(page, SCROLL_PAUSE_MS)
        if random.random() < 0.15:
            _sleep(page, (4000, 8000))

    reviews = sorted(
        collected.values(),
        key=lambda r: r.get("posted_at_approx") or "",
        reverse=True,
    )
    logger.info(
        "  collected %d reviews (stop_reason=%s)", len(reviews), stop_reason
    )

    return {
        "place_id": place_id,
        "cafe_id": cafe["id"],
        "name": cafe["name"],
        "url": url,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "stop_reason": stop_reason,
        "meta": meta,
        "reviews": reviews,
    }


# ----- DB write of place meta ---------------------------------------------


def update_cafe_meta(
    cafe_id: str,
    meta: dict[str, Any],
    *,
    place_id: str | None = None,
    upload_cover: bool = True,
) -> None:
    """Push extracted place meta into the cafes table.

    Idempotent: re-runs overwrite previous scrape values. When ``upload_cover``
    is true, the Google hero URL is downloaded, recompressed to WebP, uploaded
    to R2, and the resulting public URL is stored in ``cover_image_url``
    (Google URLs aren't a reliable long-term reference).
    """
    db = get_client()
    payload: dict[str, Any] = {
        "business_status": meta.get("business_status"),
        "google_rating": meta.get("rating"),
        "google_review_count": meta.get("review_count"),
        "price_level": meta.get("price_level"),
        "menu_url": meta.get("menu_url"),
        "phone": meta.get("phone"),
        "business_hours": meta.get("business_hours"),
    }

    hero = meta.get("hero_image")
    if hero and upload_cover and place_id:
        public_url = upload_cafe_cover(place_id, hero)
        if public_url:
            payload["cover_image_url"] = public_url
            # Also reflect the cover entry in the photos jsonb for client code
            # that reads the array directly.
            existing = db.table("cafes").select("photos").eq("id", cafe_id).execute().data
            photos = (existing[0].get("photos") if existing else None) or []
            photos = [p for p in photos if p.get("kind") != "hero"]
            photos.insert(0, {"url": public_url, "source": "r2", "kind": "hero"})
            payload["photos"] = photos

    payload = {k: v for k, v in payload.items() if v is not None}
    if not payload:
        return
    db.table("cafes").update(payload).eq("id", cafe_id).execute()


def mark_cafe_not_found(cafe_id: str) -> None:
    """Mark a cafe row when Places API returns no match — keeps it out of retry pools."""
    db = get_client()
    db.table("cafes").update({"business_status": "not_found"}).eq("id", cafe_id).execute()


def mark_cafe_duplicate(cafe_id: str, canonical_id: str) -> None:
    """Point this row at its canonical twin so future passes skip it."""
    db = get_client()
    db.table("cafes").update({"duplicate_of": canonical_id}).eq("id", cafe_id).execute()


def resolve_place_id(cafe: dict[str, Any]) -> str | None:
    """Look up a missing place_id via the Places API and persist it back.

    Returns the resolved place_id (also updates google_maps_url) or None when
    the API doesn't find a plausible match — the caller should mark the row
    as ``business_status='not_found'`` in that case.

    When another row already owns the resolved place_id (cross-source dupe),
    this row is marked ``duplicate_of`` the canonical one and we return None
    so the caller skips scraping.
    """
    place = find_place(cafe["name"], cafe.get("address"))
    if not place:
        return None
    place_id = place.get("id")
    if not place_id:
        return None

    db = get_client()
    existing = (
        db.table("cafes")
        .select("id")
        .eq("google_place_id", place_id)
        .neq("id", cafe["id"])
        .limit(1)
        .execute()
        .data
    )
    if existing:
        canonical_id = existing[0]["id"]
        logger.warning(
            "  place_id %s already owned by %s — marking %s as duplicate",
            place_id, canonical_id, cafe["id"],
        )
        mark_cafe_duplicate(cafe["id"], canonical_id)
        return None

    payload: dict[str, Any] = {
        "google_place_id": place_id,
        "google_maps_url": place.get("googleMapsUri"),
    }
    api_status = place.get("businessStatus")
    if api_status and (mapped := _API_STATUS_MAP.get(api_status)):
        payload["business_status"] = mapped
    db.table("cafes").update(payload).eq("id", cafe["id"]).execute()
    cafe["google_place_id"] = place_id
    cafe["google_maps_url"] = place.get("googleMapsUri")
    return place_id


# ----- DB picker -----------------------------------------------------------


def pick_cafes(
    limit: int | None,
    cafe_id: str | None,
    *,
    include_missing: bool = True,
    only_missing: bool = False,
    cafe_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Select cafes to process.

    ``include_missing=True``: also returns rows without a google_place_id —
    these need ``resolve_place_id`` first. ``only_missing=True`` returns just
    those (for the dedicated --resolve-only mode).

    Already-scraped rows (matching JSON exists) are skipped unless ``cafe_id``
    is explicit. Rows with ``business_status='not_found'`` are skipped to avoid
    re-spending Places API calls on dead leads.
    """
    db = get_client()
    q = db.table("cafes").select(
        "id, name, address, google_place_id, google_maps_url, business_status, duplicate_of"
    )
    if cafe_id:
        q = q.eq("id", cafe_id)
    elif cafe_ids:
        q = q.in_("id", cafe_ids)
    rows: list[dict[str, Any]] = q.execute().data or []

    if cafe_id or cafe_ids:
        return rows

    rows = [r for r in rows if r.get("business_status") != "not_found"]
    rows = [r for r in rows if not r.get("duplicate_of")]

    if only_missing:
        rows = [r for r in rows if not r.get("google_place_id")]
    elif not include_missing:
        rows = [r for r in rows if r.get("google_place_id")]

    # Skip cafes already scraped (have a local JSON).
    def _done(r: dict[str, Any]) -> bool:
        pid = r.get("google_place_id")
        return bool(pid) and (OUT_DIR / f"{pid}.json").exists()

    rows = [r for r in rows if not _done(r)]
    if limit:
        rows = rows[:limit]
    return rows


# ----- Main ----------------------------------------------------------------


def _launch_persistent(pw: Playwright, *, headful: bool):
    """Launch a real Chrome instance against our persistent profile dir.

    Why persistent + channel="chrome": Google blocks login on bundled Chromium
    ("此瀏覽器不安全"). Pointing at system Chrome with a dedicated user-data-dir
    sidesteps both the security warning and the need to manage storage_state
    files — cookies live inside the profile dir directly.
    """
    AUTH_DIR.mkdir(parents=True, exist_ok=True)
    USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    context = pw.chromium.launch_persistent_context(
        user_data_dir=str(USER_DATA_DIR),
        channel="chrome",
        headless=not headful,
        locale="zh-TW",
        timezone_id="Asia/Taipei",
        viewport={"width": 1280, "height": 900},
        args=[
            "--disable-blink-features=AutomationControlled",
            "--lang=zh-TW",
        ],
        extra_http_headers={"Accept-Language": "zh-TW,zh;q=0.9,en;q=0.5"},
    )
    return context


def login_flow(pw: Playwright) -> None:
    """Open a headful Chrome with the persistent profile so the user can log in."""
    context = _launch_persistent(pw, headful=True)
    page = context.pages[0] if context.pages else context.new_page()
    page.goto(_with_hl("https://www.google.com/maps"))
    print("=" * 60)
    print("請在開啟的瀏覽器中完成 Google 登入（含 2FA / 驗證碼）。")
    print("登入完成、確認看到 Google Maps 後，回到此終端機按 Enter。")
    print("Cookie 會自動存到 %s" % USER_DATA_DIR)
    print("=" * 60)
    input("登入完成後按 Enter 結束 > ")
    context.close()


def run(
    pw: Playwright,
    cafes: list[dict[str, Any]],
    *,
    headful: bool,
    max_reviews: int,
    max_age_days: int,
    update_cafe: bool = False,
) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    context = _launch_persistent(pw, headful=headful)
    page = context.pages[0] if context.pages else context.new_page()

    try:
        for i, cafe in enumerate(cafes):
            # Cafes imported without a place_id need to be resolved first.
            if not cafe.get("google_place_id"):
                logger.info("→ resolving place_id for %s …", cafe["name"])
                try:
                    resolved = resolve_place_id(cafe)
                except Exception as exc:  # noqa: BLE001
                    logger.exception("Places API lookup failed: %s", exc)
                    resolved = None
                if not resolved:
                    logger.warning("  Places API: no match — marking not_found")
                    try:
                        mark_cafe_not_found(cafe["id"])
                    except Exception as exc:  # noqa: BLE001
                        logger.exception("DB mark not_found failed: %s", exc)
                    continue

            try:
                result = scrape_one(
                    page, cafe, max_reviews=max_reviews, max_age_days=max_age_days
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("Failed on cafe=%s: %s", cafe["name"], exc)
                continue
            out_path = OUT_DIR / f"{cafe['google_place_id']}.json"
            out_path.write_text(
                json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            logger.info("  wrote %s", out_path)
            if update_cafe and result.get("meta"):
                try:
                    update_cafe_meta(
                        cafe["id"], result["meta"], place_id=cafe["google_place_id"]
                    )
                    logger.info("  cafes row updated")
                except Exception as exc:  # noqa: BLE001
                    logger.exception("DB update failed for %s: %s", cafe["name"], exc)
            if i + 1 < len(cafes):
                # Long idle gap between cafes — far cheaper than a banned account.
                gap_ms = random.randint(*BETWEEN_CAFES_MS)
                logger.info("  …sleeping %.1fs before next cafe", gap_ms / 1000)
                page.wait_for_timeout(gap_ms)
    finally:
        context.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Cap on cafes processed; default = all")
    parser.add_argument("--cafe-id", type=str, default=None)
    parser.add_argument("--cafe-ids", type=str, default=None, help="逗號分隔的多個 cafe id")
    parser.add_argument("--headful", action="store_true", help="Show the browser window")
    parser.add_argument("--max-reviews", type=int, default=MAX_REVIEWS_DEFAULT)
    parser.add_argument("--max-age-days", type=int, default=MAX_AGE_DAYS_DEFAULT)
    parser.add_argument(
        "--login",
        action="store_true",
        help="Open a browser for manual Google login and save storage state, then exit",
    )
    parser.add_argument(
        "--update-cafe",
        action="store_true",
        help="After each scrape, push extracted place meta back into the cafes table",
    )
    parser.add_argument(
        "--no-missing",
        action="store_true",
        help="Skip cafes that don't yet have a google_place_id (no Places API spend)",
    )
    parser.add_argument(
        "--resolve-only",
        action="store_true",
        help="Only run Places API lookups for cafes missing a place_id; no scraping",
    )
    args = parser.parse_args()

    if args.login:
        with sync_playwright() as pw:
            login_flow(pw)
        return

    if args.resolve_only:
        rows = pick_cafes(limit=args.limit, cafe_id=args.cafe_id, only_missing=True)
        logger.info("Resolving place_id for %d cafes", len(rows))
        for cafe in rows:
            try:
                resolved = resolve_place_id(cafe)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Places API failed for %s: %s", cafe["name"], exc)
                continue
            if not resolved:
                logger.warning("  no match for %s — marking not_found", cafe["name"])
                mark_cafe_not_found(cafe["id"])
        return

    cafes = pick_cafes(
        limit=args.limit,
        cafe_id=args.cafe_id,
        cafe_ids=[c.strip() for c in args.cafe_ids.split(",")] if args.cafe_ids else None,
        include_missing=not args.no_missing,
    )
    logger.info("Picked %d cafes to scrape", len(cafes))
    if not cafes:
        return

    with sync_playwright() as pw:
        run(
            pw,
            cafes,
            headful=args.headful,
            max_reviews=args.max_reviews,
            max_age_days=args.max_age_days,
            update_cafe=args.update_cafe,
        )


if __name__ == "__main__":
    main()
