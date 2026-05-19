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
    "reviews": [
      {
        "external_id": "<stable id derived from author+time+text hash>",
        "author": "...",
        "rating": 5,
        "relative_time": "3 個月前",
        "posted_at_approx": "<iso, approximated from relative time>",
        "text": "..."
      }, ...
    ]
  }

Usage:
  uv run python -m coffee_pocket.agents.google_scraper --limit 5
  uv run python -m coffee_pocket.agents.google_scraper --cafe-id <uuid> --headful
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

from ..db import get_client

logger = logging.getLogger(__name__)

OUT_DIR = Path("data/reviews")
AUTH_DIR = Path("data/.auth")
# Persistent Chrome profile dir — keeps cookies + localStorage between runs.
# Using a real Chrome channel (not bundled Chromium) so Google doesn't flag
# the browser as "insecure" during login.
USER_DATA_DIR = AUTH_DIR / "chrome-profile"
MAX_REVIEWS_DEFAULT = 100
MAX_AGE_DAYS_DEFAULT = 365
NO_PROGRESS_LIMIT = 6  # consecutive scrolls with no new cards → stop

# Human-pace timing knobs (milliseconds). Real users don't scroll on a metronome,
# so every wait below picks a uniform random value in [min, max]. Keep these
# generous — we'd rather take an hour than get the account flagged.
SCROLL_PAUSE_MS = (2200, 4200)           # between feed scrolls
AFTER_NAV_MS = (3000, 5500)              # after opening a place URL
AFTER_TAB_CLICK_MS = (1500, 3000)        # after clicking 評論 tab
AFTER_SORT_MS = (2000, 4000)             # after picking 最新
BETWEEN_CAFES_MS = (45_000, 90_000)      # idle gap between cafes — long on purpose
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

    We locate it dynamically by walking up from a review card to the nearest
    `overflow-y: auto` ancestor — that's the panel Google scrolls internally
    when you flick the wheel on the reviews list.
    """
    page.evaluate(
        """(r) => {
            const c = document.querySelector('[data-review-id]');
            if (!c) return;
            let p = c.parentElement;
            while (p && getComputedStyle(p).overflowY !== 'auto') p = p.parentElement;
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
        "reviews": reviews,
    }


# ----- DB picker -----------------------------------------------------------


def pick_cafes(limit: int | None, cafe_id: str | None) -> list[dict[str, Any]]:
    db = get_client()
    q = db.table("cafes").select("id, name, google_place_id, google_maps_url")
    q = q.not_.is_("google_place_id", "null")
    if cafe_id:
        q = q.eq("id", cafe_id)
    rows = q.execute().data
    # Skip cafes already scraped (have a local JSON) unless explicit cafe_id
    if not cafe_id:
        rows = [r for r in rows if not (OUT_DIR / f"{r['google_place_id']}.json").exists()]
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
) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    context = _launch_persistent(pw, headful=headful)
    page = context.pages[0] if context.pages else context.new_page()

    try:
        for i, cafe in enumerate(cafes):
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
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--cafe-id", type=str, default=None)
    parser.add_argument("--headful", action="store_true", help="Show the browser window")
    parser.add_argument("--max-reviews", type=int, default=MAX_REVIEWS_DEFAULT)
    parser.add_argument("--max-age-days", type=int, default=MAX_AGE_DAYS_DEFAULT)
    parser.add_argument(
        "--login",
        action="store_true",
        help="Open a browser for manual Google login and save storage state, then exit",
    )
    args = parser.parse_args()

    if args.login:
        with sync_playwright() as pw:
            login_flow(pw)
        return

    cafes = pick_cafes(limit=args.limit, cafe_id=args.cafe_id)
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
        )


if __name__ == "__main__":
    main()
