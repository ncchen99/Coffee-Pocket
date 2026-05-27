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
import asyncio
import json
import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from coffee_pocket.config import settings
from coffee_pocket.db import get_client

from .worker import run_pipeline_for_cafe, run_pipeline_stream

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="Coffee Pocket add-cafe service", version="0.1.0")

# Self-ping mechanism to prevent Fly.io auto-sleep during background pipeline runs
active_jobs: set[str] = set()
self_ping_task: asyncio.Task | None = None
self_ping_lock = asyncio.Lock()


async def self_ping_loop(base_url: str) -> None:
    logger.info("[self-ping] loop started with base_url: %s", base_url)
    ping_url = f"{base_url.rstrip('/')}/health"
    
    # Use AsyncClient to make periodic pings
    async with httpx.AsyncClient(timeout=10.0) as client:
        while active_jobs:
            try:
                logger.info("[self-ping] Pinging ourselves at %s (active jobs: %d)...", ping_url, len(active_jobs))
                r = await client.get(ping_url)
                logger.info("[self-ping] Ping status: %d", r.status_code)
            except Exception as e:
                logger.warning("[self-ping] Ping failed: %s", e)
            
            # Wait for 20 seconds before the next ping
            await asyncio.sleep(20)
            
    logger.info("[self-ping] loop stopped because there are no active jobs.")


async def register_job(job_id: str, base_url: str) -> None:
    active_jobs.add(job_id)
    global self_ping_task
    async with self_ping_lock:
        if self_ping_task is None or self_ping_task.done():
            self_ping_task = asyncio.create_task(self_ping_loop(base_url))
            logger.info("[self-ping] Registered job %s and started loop.", job_id)
        else:
            logger.info("[self-ping] Registered job %s. Loop already running.", job_id)


async def deregister_job(job_id: str) -> None:
    active_jobs.discard(job_id)
    logger.info("[self-ping] Deregistered job %s (remaining active jobs: %d).", job_id, len(active_jobs))


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


@app.post("/cafes")
async def submit_cafe(req: SubmitCafeRequest, request: Request):
    """Insert a cafe row + stream full pipeline run using SSE."""
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
        # Using AsyncClient since we are in an async def handler
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
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
    
    already_existed = len(existing) > 0
    cafe_id = existing[0]["id"] if already_existed else None

    if not already_existed:
        # 寫入新 cafe row。location 用 PostGIS WKT。
        # source='user_submitted' 對應 migration 0031 加的欄位
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
        logger.info("inserted cafe %s (%s) → streaming pipeline", cafe_id, name)
    else:
        logger.info("cafe already exists: %s (%s)", cafe_id, name)

    job_id = uuid4().hex
    base_url = str(request.base_url)

    async def event_generator():
        if not already_existed:
            await register_job(job_id, base_url)
        try:
            if already_existed:
                yield f"data: {json.dumps({'type': 'already_exists', 'cafe_id': cafe_id})}\n\n"
                return

            async for event in run_pipeline_stream(cafe_id=cafe_id, place_id=req.place_id, job_id=job_id):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            logger.exception("Error in event_generator for job=%s cafe=%s", job_id, cafe_id)
            yield f"data: {json.dumps({'type': 'pipeline_error', 'message': str(exc)})}\n\n"
        finally:
            if not already_existed:
                await deregister_job(job_id)

    # SSE headers
    sse_headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), headers=sse_headers)
