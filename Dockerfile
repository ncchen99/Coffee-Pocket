# Coffee Pocket add-cafe FastAPI service (services/api).
# Build context = repo root (worker spawns `python -m coffee_pocket.*` subprocesses,
# so the whole `src/coffee_pocket` tree must be inside the image).
#
# Base image ships Chromium + system deps — saves a ~300MB `playwright install --with-deps`.
FROM mcr.microsoft.com/playwright/python:v1.60.0-jammy

# Install Google Chrome stable — scraper uses channel="chrome" against a
# persistent profile (Google blocks login on bundled Chromium with "此瀏覽器不安全").
# Profile is mounted from a Fly volume at /app/data/.auth/chrome-profile.
RUN apt-get update && apt-get install -y --no-install-recommends wget gnupg ca-certificates \
    && wget -qO- https://dl.google.com/linux/linux_signing_key.pub \
       | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# uv (project uses uv, not pip/poetry)
COPY --from=ghcr.io/astral-sh/uv:0.5.4 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PORT=8080

WORKDIR /app

# Install deps first (cached layer) — only re-runs when lockfile changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# App code. src/ is needed by the worker's subprocess CLIs.
COPY src ./src
COPY services ./services

EXPOSE 8080
CMD ["uv", "run", "--no-dev", "uvicorn", "services.api.main:app", "--host", "0.0.0.0", "--port", "8080"]
