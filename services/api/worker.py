"""Background worker — runs the full add-cafe pipeline for one cafe.

Stages (sequential; if any fails we log + bail, partial state remains in DB so
the next run picks up where this left off):

  1. Pinyin / slug          → cafes.name_pinyin / cafes.slug
                              (前端搜尋與路由需要;放最前面因為不依賴爬蟲。)
  2. Scrape Google reviews  → data/reviews/<place_id>.json + cafes meta
  3. LLM extract signals    → reviews_raw.extracted_signals
  4. Semantic merge         → cafe_tags / tag_evidence
  5. AI summary             → cafes.summary_ai
                              (要等 step 2 把評論寫進 reviews_raw 後才有素材。)

Each stage is invoked via ``uv run python -m <module> --cafe-id <uuid>`` rather
than imported directly. Reasons:
  - Each module's ``main()`` parses argparse; calling it programmatically would
    mean refactoring 5+ modules. Subprocesses give us reuse for free.
  - Subprocess isolation — a Playwright crash in the scraper can't take down
    the FastAPI server.
  - Pipeline logs land in the subprocess's stdout, which we capture and log.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# Where the scraper writes per-cafe review JSON; google_extract reads from here.
REVIEWS_DIR = Path(__file__).resolve().parents[2] / "data" / "reviews"

# Each stage as (label, argv). `uv run -m <module>` ensures the same env as CLI usage.
PIPELINE_TIMEOUT_S = 60 * 15  # 15 min cap per stage — Playwright can be slow.


async def _run_stage(label: str, argv: list[str]) -> bool:
    """Run one pipeline stage as a subprocess. Returns True on success."""
    logger.info("[pipeline] start stage=%s argv=%s", label, argv)
    proc = await asyncio.create_subprocess_exec(
        *argv,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=PIPELINE_TIMEOUT_S)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        logger.error("[pipeline] stage=%s TIMED OUT after %ds", label, PIPELINE_TIMEOUT_S)
        return False

    out = stdout.decode("utf-8", errors="replace") if stdout else ""
    if proc.returncode == 0:
        logger.info("[pipeline] stage=%s OK (%d bytes log)", label, len(out))
        if out:
            # Stream a tail so we don't flood logs but still get a hint of what happened.
            tail = "\n".join(out.splitlines()[-20:])
            logger.debug("[pipeline] stage=%s tail:\n%s", label, tail)
        return True

    logger.error(
        "[pipeline] stage=%s FAILED rc=%s\n%s", label, proc.returncode, out[-4000:]
    )
    return False


async def _run_pipeline_async(cafe_id: str, place_id: str | None, job_id: str) -> None:
    logger.info("[pipeline] job=%s cafe=%s start", job_id, cafe_id)

    # Stage 1 — name_pinyin + slug。generate_pinyin 不支援 --cafe-id,
    # 但預設只處理 missing 的列,所以直接 --apply 即可,不會去動既有資料。
    pinyin_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.prepare.generate_pinyin",
        "--apply",
    ]
    if not await _run_stage("pinyin", pinyin_argv):
        return

    # Stage 2 — scrape Google reviews. --update-cafe writes meta (cover image,
    # hours, rating, etc.) back to cafes; without it the row would stay bare.
    scrape_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.enrich.google_scraper",
        "--cafe-id", cafe_id,
        "--update-cafe",
    ]
    if not await _run_stage("scrape", scrape_argv):
        return

    # Stage 2.5 — gallery photos (10 total: 7 from 全部, 3 from 氛圍).
    # Reuses the same Playwright profile as the scraper. Failures here don't
    # block downstream stages — cover_image_url was already populated by the
    # scrape stage as a fallback.
    photos_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.enrich.google_photos_scraper",
        "--cafe-id", cafe_id,
    ]
    await _run_stage("photos", photos_argv)

    # Stage 3 — LLM extract for the freshly scraped reviews JSON.
    # google_extract walks data/reviews/*.json by default; we narrow to the
    # single file if we know the place_id.
    extract_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.process.google_extract",
    ]
    if place_id:
        target = REVIEWS_DIR / f"{place_id}.json"
        if target.exists():
            extract_argv.extend(["--file", str(target)])
        else:
            logger.warning(
                "[pipeline] expected reviews file missing: %s — falling back to bulk extract",
                target,
            )
    if not await _run_stage("extract", extract_argv):
        return

    # Stage 4 — merge extracted signals → cafe_tags.
    semantic_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.process.semantic",
        "--cafe-id", cafe_id,
    ]
    if not await _run_stage("semantic", semantic_argv):
        return

    # Stage 5 — AI summary (map-reduce over reviews_raw) → cafes.summary_ai。
    # 即使失敗也只是少了一段摘要,其他資料已就緒,不該擋住整體 done。
    summary_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.process.ai_summary",
        "--cafe-id", cafe_id,
    ]
    await _run_stage("ai_summary", summary_argv)

    logger.info("[pipeline] job=%s cafe=%s done", job_id, cafe_id)


def run_pipeline_for_cafe(cafe_id: str, job_id: str, place_id: str | None = None) -> None:
    """Entry point called by FastAPI BackgroundTasks (sync wrapper).

    Looks up place_id from DB if caller didn't pass it. We could plumb it
    through from the request, but reading once here keeps the caller simple.
    """
    if not place_id:
        from coffee_pocket.db import get_client
        try:
            row = (
                get_client()
                .table("cafes")
                .select("google_place_id")
                .eq("id", cafe_id)
                .single()
                .execute()
                .data
            )
            place_id = (row or {}).get("google_place_id")
        except Exception as exc:
            logger.warning("[pipeline] failed to look up place_id for cafe=%s: %s", cafe_id, exc)

    try:
        asyncio.run(_run_pipeline_async(cafe_id=cafe_id, place_id=place_id, job_id=job_id))
    except Exception:
        # 任何 unhandled 都吞掉 + 記錄,免得 BackgroundTasks 直接 kill 整個請求 task。
        logger.exception("[pipeline] job=%s cafe=%s crashed", job_id, cafe_id)


async def _run_stage_stream(label: str, argv: list[str]):
    """Run one pipeline stage and yield status and logs in real-time."""
    logger.info("[pipeline] start stage=%s argv=%s (stream)", label, argv)
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    yield {"type": "stage_start", "stage": label}

    proc = await asyncio.create_subprocess_exec(
        *argv,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=env,
    )

    try:
        while True:
            line_bytes = await proc.stdout.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace").strip()
            if line:
                yield {"type": "log", "stage": label, "message": line}
    except Exception as exc:
        proc.kill()
        await proc.wait()
        logger.exception("[pipeline] stage=%s exception during stream", label)
        yield {"type": "stage_error", "stage": label, "message": str(exc)}
        yield {"type": "stage_failed", "stage": label}
        return

    await proc.wait()
    if proc.returncode == 0:
        logger.info("[pipeline] stage=%s OK (stream)", label)
        yield {"type": "stage_done", "stage": label}
    else:
        logger.error("[pipeline] stage=%s FAILED rc=%s (stream)", label, proc.returncode)
        yield {"type": "stage_failed", "stage": label, "returncode": proc.returncode}


async def run_pipeline_stream(cafe_id: str, place_id: str | None, job_id: str):
    logger.info("[pipeline] job=%s cafe=%s starting stream", job_id, cafe_id)
    yield {"type": "pipeline_start", "cafe_id": cafe_id, "job_id": job_id}

    # Stage 1 — name_pinyin + slug
    pinyin_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.prepare.generate_pinyin",
        "--apply",
    ]
    pinyin_success = False
    async for event in _run_stage_stream("pinyin", pinyin_argv):
        yield event
        if event["type"] == "stage_done":
            pinyin_success = True
    if not pinyin_success:
        yield {"type": "pipeline_failed", "error_stage": "pinyin"}
        return

    # Stage 2 — scrape Google reviews
    scrape_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.enrich.google_scraper",
        "--cafe-id", cafe_id,
        "--update-cafe",
    ]
    scrape_success = False
    async for event in _run_stage_stream("scrape", scrape_argv):
        yield event
        if event["type"] == "stage_done":
            scrape_success = True
    if not scrape_success:
        yield {"type": "pipeline_failed", "error_stage": "scrape"}
        return

    # Stage 2.5 — gallery photos. Non-blocking: we emit events but don't bail
    # out of the pipeline if it fails.
    photos_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.enrich.google_photos_scraper",
        "--cafe-id", cafe_id,
    ]
    async for event in _run_stage_stream("photos", photos_argv):
        yield event

    # Stage 3 — LLM extract
    extract_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.process.google_extract",
    ]
    if place_id:
        target = REVIEWS_DIR / f"{place_id}.json"
        if target.exists():
            extract_argv.extend(["--file", str(target)])
        else:
            logger.warning(
                "[pipeline] expected reviews file missing: %s — falling back to bulk extract",
                target,
            )
    extract_success = False
    async for event in _run_stage_stream("extract", extract_argv):
        yield event
        if event["type"] == "stage_done":
            extract_success = True
    if not extract_success:
        yield {"type": "pipeline_failed", "error_stage": "extract"}
        return

    # Stage 4 — merge extracted signals → cafe_tags
    semantic_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.process.semantic",
        "--cafe-id", cafe_id,
    ]
    semantic_success = False
    async for event in _run_stage_stream("semantic", semantic_argv):
        yield event
        if event["type"] == "stage_done":
            semantic_success = True
    if not semantic_success:
        yield {"type": "pipeline_failed", "error_stage": "semantic"}
        return

    # Stage 5 — AI summary
    summary_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.process.ai_summary",
        "--cafe-id", cafe_id,
    ]
    async for event in _run_stage_stream("ai_summary", summary_argv):
        yield event

    logger.info("[pipeline] job=%s cafe=%s done (stream)", job_id, cafe_id)
    yield {"type": "pipeline_done", "cafe_id": cafe_id, "job_id": job_id}
