"""Cloudflare R2 image storage.

Google Maps hero image URLs aren't a reliable long-term reference — Google
rotates the underlying photo identifiers and the URL format changes. We mirror
each cafe's cover photo into our own R2 bucket as WebP and store the public
URL instead.

Usage:
    from coffee_pocket.storage import upload_cafe_cover
    public_url = upload_cafe_cover(place_id, google_image_url)
"""

from __future__ import annotations

import io
import logging
from functools import lru_cache
from typing import Any

import boto3
import httpx
from PIL import Image

from .config import settings

logger = logging.getLogger(__name__)

WEBP_QUALITY = 82
MAX_DIM = 1600  # cap longest edge so we don't pay R2 bandwidth on 4K photos


@lru_cache(maxsize=1)
def _s3() -> Any:
    if not settings.r2_endpoint or not settings.r2_access_key_id:
        raise RuntimeError(
            "R2 credentials missing — set R2_ENDPOINT / R2_ACCESS_KEY_ID / "
            "R2_SECRET_ACCESS_KEY / R2_BUCKET in .env"
        )
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )


def _fetch_image(url: str) -> bytes:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
        ),
        "Accept": "image/webp,image/*,*/*;q=0.8",
        "Referer": "https://www.google.com/maps/",
    }
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        r = client.get(url, headers=headers)
        r.raise_for_status()
        return r.content


def _to_webp(raw: bytes) -> bytes:
    img = Image.open(io.BytesIO(raw))
    img = img.convert("RGB")
    if max(img.size) > MAX_DIM:
        img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=WEBP_QUALITY, method=6)
    return buf.getvalue()


def upload_cafe_cover(place_id: str, image_url: str) -> str | None:
    """Download, compress, upload, return the public R2 URL.

    Returns None if the source URL fails to fetch or decode. Re-runs overwrite
    the existing object (idempotent on place_id).
    """
    if not image_url:
        return None
    try:
        raw = _fetch_image(image_url)
        webp = _to_webp(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("cover image fetch/encode failed for %s: %s", place_id, exc)
        return None

    key = f"cafes/{place_id}.webp"
    try:
        _s3().put_object(
            Bucket=settings.r2_bucket,
            Key=key,
            Body=webp,
            ContentType="image/webp",
            CacheControl="public, max-age=31536000, immutable",
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("R2 upload failed for %s: %s", place_id, exc)
        return None

    base = settings.r2_public_base.rstrip("/")
    return f"{base}/{key}" if base else key
