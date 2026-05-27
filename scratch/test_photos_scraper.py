"""Quick smoke test for the Google photos scraper.

Edit `CAFE_URL` / `PLACE_ID` below to point at the place you want to test,
then run:

    uv run python scratch/test_photos_scraper.py

This forces --dry-run + --headful so you can watch the browser, see which
tabs get clicked, and verify the 10 photo URLs printed at the end match the
order described in `google_photos_scraper.py` (cover + 9 list slots).
"""

from __future__ import annotations

import logging

from playwright.sync_api import sync_playwright

from coffee_pocket.agents.enrich.google_photos_scraper import (
    arrange_photos,
    scrape_photos_for_cafe,
)
from coffee_pocket.agents.enrich.google_scraper import _launch_for_scrape

# --- Edit one of these to point at your test cafe -------------------------
# A full Google Maps URL is the most reliable input — the scraper just goes
# there directly. If you only have a place_id, use the second form.
CAFE_URL: str | None = "https://www.google.com/maps/place/?q=place_id:ChIJX7nfqf91bjQRwfwwGB6t1c8"
PLACE_ID: str | None = None  # e.g. "ChIJX7nfqf91bjQRwfwwGB6t1c8"
# -------------------------------------------------------------------------


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if not CAFE_URL and not PLACE_ID:
        raise SystemExit("Set CAFE_URL or PLACE_ID at the top of this script.")

    cafe = {
        "id": "test",
        "name": "test-cafe",
        "google_place_id": PLACE_ID or "test",
        "google_maps_url": CAFE_URL,
    }

    with sync_playwright() as pw:
        ctx = _launch_for_scrape(pw, headful=True)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            result = scrape_photos_for_cafe(page, cafe)
        finally:
            ctx.close()

    print("\n=== raw collected ===")
    print(f"全部 ({len(result['all'])}):")
    for i, u in enumerate(result["all"]):
        print(f"  [{i}] {u}")

    cover, photos = arrange_photos(result["all"])
    print("\n=== final arrangement ===")
    print(f"cover_image_url: {cover}")
    print(f"photos[{len(photos)}]:")
    for i, item in enumerate(photos):
        print(f"  [{i}] tab={item['tab']} src={item['src']}")


if __name__ == "__main__":
    main()
