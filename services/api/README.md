# Add-cafe API service

FastAPI service that powers the "新增咖啡廳" flow in the frontend.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/health` | liveness probe |
| `POST` | `/places/search` | proxy Google Places Text Search; returns candidates + `already_exists` flag |
| `POST` | `/cafes` | insert a cafe row (via Place Details) and queue the background pipeline |

The `POST /cafes` response is fire-and-forget — the frontend only shows a
toast and trusts the worker to finish in the background.

## Run

```bash
uv sync                                            # picks up fastapi + uvicorn from pyproject.toml
uv run uvicorn services.api.main:app --reload --port 8000
```

Required env vars (loaded from `.env` at the repo root via `coffee_pocket.config`):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_PLACES_API_KEY`
- `OPENROUTER_API_KEY` (used by the LLM extract stage spawned by the worker)

Tell the frontend where the API lives by setting `VITE_ADD_CAFE_API_BASE` in
`web/.env`. Defaults to `http://localhost:8000` if unset.

## Pipeline (sequential, per submitted cafe)

1. `coffee_pocket.agents.enrich.google_scraper --cafe-id <uuid> --update-cafe`
2. `coffee_pocket.agents.process.google_extract --file data/reviews/<place_id>.json`
3. `coffee_pocket.agents.process.semantic --cafe-id <uuid>`

Each stage is spawned as `uv run python -m …` so we reuse the existing CLIs
without refactoring. See `worker.py` for the implementation.
