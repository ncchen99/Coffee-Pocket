"""Background worker — runs the full add-cafe pipeline for one cafe.

Stages (sequential; if any fails we log + bail, partial state remains in DB so
the next run picks up where this left off):

  1. Scrape Google reviews  → data/reviews/<place_id>.json
  2. LLM extract signals    → reviews_raw.extracted_signals
  3. Semantic merge         → cafe_tags / tag_evidence

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

    # Stage 1 — scrape Google reviews. --update-cafe writes meta (cover image,
    # hours, rating, etc.) back to cafes; without it the row would stay bare.
    scrape_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.enrich.google_scraper",
        "--cafe-id", cafe_id,
        "--update-cafe",
    ]
    if not await _run_stage("scrape", scrape_argv):
        return

    # Stage 2 — LLM extract for the freshly scraped reviews JSON.
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

    # Stage 3 — merge extracted signals → cafe_tags.
    semantic_argv = [
        "uv", "run", "python", "-m",
        "coffee_pocket.agents.process.semantic",
        "--cafe-id", cafe_id,
    ]
    if not await _run_stage("semantic", semantic_argv):
        return

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
