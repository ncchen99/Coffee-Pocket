"""FastAPI service for user-submitted cafe additions.

Why a separate service (not a Supabase Edge Function):
  The full pipeline (Places lookup → Playwright scraper → LLM extract → semantic
  merge) is implemented in Python and uses Playwright + heavy deps. Re-implementing
  it as a Deno/TS Function would mean either rewriting the scraper or shelling out
  to Python anyway. Easier to expose the existing pipeline behind a thin FastAPI.

Endpoints
---------
- ``POST /places/search`` — proxy Google Places Text Search; returns up to a
  handful of candidate places matching a free-text query. Frontend calls this
  only after the user presses Enter, not on every keystroke (Places API is paid).
- ``POST /cafes`` — accept a ``place_id`` chosen by the user. Inserts the cafe
  row immediately via Places Details, then queues a background pipeline run
  (scrape → extract → semantic). Returns ``{job_id}``; the response is
  fire-and-forget — the frontend just shows a "正在新增" toast.

Run locally:
    uv run uvicorn services.api.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from coffee_pocket.config import settings
from coffee_pocket.db import get_client

from .worker import run_pipeline_for_cafe

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="Coffee Pocket add-cafe service", version="0.1.0")

# CORS — 從 settings.cors_allowed_origins 讀(comma-separated)。空值時 fallback
# 成 "*",給本機開發用;正式環境一定要設,不然任何 origin 都能打。
_origins = [o.strip() for o in settings.cors_allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ─── Places API ────────────────────────────────────────────────────────────

_TEXT_SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText"
_FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.googleMapsUri",
    "places.businessStatus",
    "places.primaryType",
])

# 結果數上限 — 給使用者挑選用,5 個夠了,多了反而難挑。
_MAX_RESULTS = 5


def _places_headers() -> dict[str, str]:
    if not settings.google_places_api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_PLACES_API_KEY missing")
    return {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_places_api_key,
        "X-Goog-FieldMask": _FIELD_MASK,
    }


# ─── Schemas ───────────────────────────────────────────────────────────────


class PlaceSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=200)


class PlaceResult(BaseModel):
    place_id: str
    name: str
    address: str | None
    lat: float
    lng: float
    google_maps_url: str | None
    already_exists: bool


class PlaceSearchResponse(BaseModel):
    results: list[PlaceResult]


class SubmitCafeRequest(BaseModel):
    place_id: str = Field(min_length=1)


class SubmitCafeResponse(BaseModel):
    job_id: str
    cafe_id: str
    already_existed: bool


# ─── Endpoints ─────────────────────────────────────────────────────────────


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/places/search", response_model=PlaceSearchResponse)
def places_search(req: PlaceSearchRequest) -> PlaceSearchResponse:
    """Proxy Google Places Text Search and tag duplicates already in our DB.

    Bias the query to Tainan because that's the only region we serve right now.
    If the user wants a non-Tainan store the API will still return it, but the
    boost prevents Taipei chains from drowning out local matches.
    """
    headers = _places_headers()
    body: dict[str, Any] = {
        "textQuery": f"{req.query} 台南",
        "languageCode": "zh-TW",
        "regionCode": "TW",
        "maxResultCount": _MAX_RESULTS,
    }
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(_TEXT_SEARCH_ENDPOINT, headers=headers, json=body)
            r.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Places search failed for %r: %s", req.query, exc)
        raise HTTPException(status_code=502, detail="Places API error") from exc

    raw_places = (r.json() or {}).get("places") or []

    # 標出 DB 已存在的 place_id —— 不一次撈全表(現在 200+ 筆還 OK,之後可改 IN 查詢)。
    pids = [p["id"] for p in raw_places if p.get("id")]
    existing_pids: set[str] = set()
    if pids:
        db = get_client()
        rows = (
            db.table("cafes")
            .select("google_place_id")
            .in_("google_place_id", pids)
            .execute()
            .data
            or []
        )
        existing_pids = {row["google_place_id"] for row in rows if row.get("google_place_id")}

    results: list[PlaceResult] = []
    for place in raw_places:
        loc = place.get("location") or {}
        lat, lng = loc.get("latitude"), loc.get("longitude")
        if lat is None or lng is None:
            continue
        pid = place.get("id")
        if not pid:
            continue
        results.append(
            PlaceResult(
                place_id=pid,
                name=(place.get("displayName") or {}).get("text") or "(no name)",
                address=place.get("formattedAddress"),
                lat=float(lat),
                lng=float(lng),
                google_maps_url=place.get("googleMapsUri"),
                already_exists=pid in existing_pids,
            )
        )
    return PlaceSearchResponse(results=results)


@app.post("/cafes", response_model=SubmitCafeResponse)
def submit_cafe(req: SubmitCafeRequest, tasks: BackgroundTasks) -> SubmitCafeResponse:
    """Insert a cafe row + queue full pipeline run.

    The Places search response already had everything we need to write the cafe
    row (name / address / lat-lng / google_maps_url). But the frontend only
    sends `place_id` — we re-fetch via Place Details to make the endpoint safe
    against tampering and to canonicalize the data.
    """
    headers = _places_headers()
    details_url = f"https://places.googleapis.com/v1/places/{req.place_id}"
    details_field_mask = ",".join([
        "id",
        "displayName",
        "formattedAddress",
        "location",
        "googleMapsUri",
        "businessStatus",
    ])
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(
                details_url,
                headers={**headers, "X-Goog-FieldMask": details_field_mask},
                params={"languageCode": "zh-TW"},
            )
            r.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Place Details failed for %s: %s", req.place_id, exc)
        raise HTTPException(status_code=502, detail="Place Details error") from exc

    place = r.json() or {}
    loc = place.get("location") or {}
    lat, lng = loc.get("latitude"), loc.get("longitude")
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="place missing location")
    name = (place.get("displayName") or {}).get("text") or "(no name)"
    address = place.get("formattedAddress")
    google_maps_url = place.get("googleMapsUri")

    db = get_client()

    # 已存在 → 直接回傳該 cafe_id,不重複跑 pipeline。
    existing = (
        db.table("cafes")
        .select("id, name")
        .eq("google_place_id", req.place_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        cafe_id = existing[0]["id"]
        logger.info("cafe already exists, skipping pipeline: %s (%s)", cafe_id, name)
        return SubmitCafeResponse(
            job_id="noop",
            cafe_id=cafe_id,
            already_existed=True,
        )

    # 寫入新 cafe row。location 用 PostGIS WKT。
    # source='user_submitted' 對應 migration 0031 加的欄位 —— 區隔系統種子資料
    # 與使用者透過 /add-cafe 送出的資料,方便之後審核 / 顯示徽章。
    inserted = (
        db.table("cafes")
        .insert({
            "name": name,
            "address": address,
            "google_place_id": req.place_id,
            "google_maps_url": google_maps_url,
            "location": f"SRID=4326;POINT({float(lng)} {float(lat)})",
            "source": "user_submitted",
        })
        .execute()
        .data
    )
    if not inserted:
        raise HTTPException(status_code=500, detail="failed to insert cafe")
    cafe_id = inserted[0]["id"]
    logger.info("inserted cafe %s (%s) → queueing pipeline", cafe_id, name)

    job_id = uuid4().hex
    tasks.add_task(run_pipeline_for_cafe, cafe_id=cafe_id, job_id=job_id)
    return SubmitCafeResponse(job_id=job_id, cafe_id=cafe_id, already_existed=False)
