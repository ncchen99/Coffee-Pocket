"""Resolve a cafe's Google place_id via the Places API (Text Search) + Details.

Some rows in `cafes` are imported without `google_place_id` / `google_maps_url`
(e.g. from external lists). Before the Playwright scraper can visit the place
panel for these cafes, we need a place_id. The Places API v1 Text Search
endpoint is way more reliable than scraping `/maps/search/?query=...` —
results are deterministic and we don't get rate-limited mid-batch.

Free tier: 5,000 Text Search calls / month + 5,000 Place Details / month.

Match quality
-------------
Text Search always returns *something* — when our name doesn't match anything,
it falls back to the closest plausible coffee shop in the queried region.
We defend with two layers:

1. Query order — ``"<name> <address>"`` first (geographically anchored),
   then ``"<name> <city>"`` as fallback. The address-first query rarely
   returns a wrong-store result when the address is real.
2. Name similarity gate — the returned ``displayName`` is normalized
   (strip whitespace + punctuation + casefold) and compared against the
   input name. If neither name contains the other and the ratio is low,
   we reject the match.
"""

from __future__ import annotations

import logging
import re
from difflib import SequenceMatcher
from typing import Any

import httpx

from ...config import settings

logger = logging.getLogger(__name__)

_TEXT_SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText"
_DETAILS_ENDPOINT = "https://places.googleapis.com/v1/places/{place_id}"
_FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.googleMapsUri",
    "places.businessStatus",
])
_DETAILS_FIELD_MASK = ",".join([
    "id",
    "displayName",
    "formattedAddress",
    "location",
    "googleMapsUri",
    "businessStatus",
])

_PUNCT_RE = re.compile(r"[\s\-\_\.\(\)\[\]（）「」'\"`,，、。/!！?？:：;；&+]")

# Below this ratio AND no containment in either direction → reject as wrong store.
_MIN_NAME_RATIO = 0.55


def _normalize_name(name: str) -> str:
    if not name:
        return ""
    return _PUNCT_RE.sub("", name).casefold()


def name_similarity(a: str, b: str) -> float:
    """Return a 0–1 score for how alike two cafe names are after normalization.

    Always returns 1.0 when one normalized name contains the other (covers
    branch-name variants like 'Mr Piki Cafe' ⊂ 'Mr Piki Cafe 民族店'). Falls
    back to SequenceMatcher for everything else.
    """
    na, nb = _normalize_name(a), _normalize_name(b)
    if not na or not nb:
        return 0.0
    if na == nb or na in nb or nb in na:
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


def _is_plausible_match(query_name: str, place: dict[str, Any]) -> bool:
    """Reject results whose name doesn't resemble what we asked for."""
    display = (place.get("displayName") or {}).get("text") or ""
    ratio = name_similarity(query_name, display)
    if ratio < _MIN_NAME_RATIO:
        logger.info(
            "  reject %r → %r (similarity %.2f below threshold)",
            query_name, display, ratio,
        )
        return False
    return True


def _post_text_search(client: httpx.Client, headers: dict[str, str], query: str) -> list[dict[str, Any]]:
    try:
        r = client.post(
            _TEXT_SEARCH_ENDPOINT,
            headers=headers,
            json={"textQuery": query, "languageCode": "zh-TW", "regionCode": "TW"},
        )
        r.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Places API request failed for %r: %s", query, exc)
        return []
    return (r.json() or {}).get("places") or []


def find_place(name: str, address: str | None = None, city: str = "台南") -> dict[str, Any] | None:
    """Return the best-match place dict, or None when nothing plausible matches.

    Query order: address-anchored first (much less prone to "nearest cafe"
    misfires), then city-anchored as fallback. Each candidate is gated by
    the name-similarity check.
    """
    if not settings.google_places_api_key:
        raise RuntimeError("GOOGLE_PLACES_API_KEY missing in .env")

    queries: list[str] = []
    if address:
        queries.append(f"{name} {address}".strip())
    queries.append(f"{name} {city}".strip())

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_places_api_key,
        "X-Goog-FieldMask": _FIELD_MASK,
    }
    with httpx.Client(timeout=15.0) as client:
        for q in queries:
            places = _post_text_search(client, headers, q)
            for place in places[:3]:  # only consider the top few candidates per query
                if _is_plausible_match(name, place):
                    logger.info("  resolved %r → %s", q, place.get("id"))
                    return place
    return None


def get_place_details(place_id: str) -> dict[str, Any] | None:
    """Fetch the canonical display name + status for an existing place_id.

    Used by the audit pass — re-query name is cheaper than re-running Text
    Search and tells us what Google currently calls the place.
    """
    if not settings.google_places_api_key:
        raise RuntimeError("GOOGLE_PLACES_API_KEY missing in .env")
    headers = {
        "X-Goog-Api-Key": settings.google_places_api_key,
        "X-Goog-FieldMask": _DETAILS_FIELD_MASK,
    }
    url = _DETAILS_ENDPOINT.format(place_id=place_id)
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(url, headers=headers, params={"languageCode": "zh-TW"})
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as exc:
        logger.warning("Place Details failed for %s: %s", place_id, exc)
        return None
