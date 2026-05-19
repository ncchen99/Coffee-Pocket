"""OpenRouter chat helper — DeepSeek by default, JSON-only outputs."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx

from .config import settings

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMError(RuntimeError):
    pass


def chat_json(
    system: str,
    user: str,
    *,
    model: str | None = None,
    max_retries: int = 2,
    timeout: float = 90.0,
) -> dict[str, Any]:
    """Call OpenRouter and parse a JSON object from the response.

    Retries on transport / JSON-parse failure. Raises LLMError on final failure.
    """
    model = model or settings.openrouter_model
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
    }

    last_err: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(OPENROUTER_URL, headers=headers, json=payload)
                if resp.status_code == 429:
                    # Exponential backoff for free-tier rate limits
                    sleep_s = 5 * (2**attempt)
                    logger.warning("OpenRouter 429 — sleeping %ds", sleep_s)
                    time.sleep(sleep_s)
                    last_err = httpx.HTTPStatusError(
                        "429", request=resp.request, response=resp
                    )
                    continue
                resp.raise_for_status()
                data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return json.loads(content)
        except (httpx.HTTPError, KeyError, json.JSONDecodeError) as exc:
            last_err = exc
            logger.warning("LLM call failed (attempt %d): %s", attempt + 1, exc)
            time.sleep(1.5 * (attempt + 1))
    raise LLMError(f"chat_json failed after {max_retries + 1} attempts: {last_err}")
