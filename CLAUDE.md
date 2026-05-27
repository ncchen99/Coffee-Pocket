# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Coffee Pocket is a **Tainan cafe discovery app** with two independent parts:

1. **Python data pipeline** (`src/coffee_pocket/`) — scrapes, cleans, and semantically labels cafe data into Supabase.
2. **Web frontend** (`web/`) — React/TypeScript SPA for browsing/searching cafes.

---

## Python Pipeline

### Runtime

Uses `uv` (not pip/poetry). Always prefix commands with `uv run`:

```bash
uv run python -m coffee_pocket.agents.<subpackage>.<module> [flags]
```

### Module verification (no test suite)

```bash
uv run python - <<'PY'
import importlib
for name in [
    "coffee_pocket.agents.sources.cafenomad",
    "coffee_pocket.agents.prepare.recheck_place_ids",
    "coffee_pocket.agents.enrich.google_scraper",
    "coffee_pocket.agents.process.semantic",
]:
    importlib.import_module(name)
print("ok")
PY
```

### Pipeline stages

| Stage | Module path | Notes |
|---|---|---|
| 1. Ingest | `agents/sources/cafenomad.py` | Fetches Cafe Nomad Tainan data |
| 1. Ingest | `agents/sources/tainan_list.py` | Imports Google Maps list (Playwright) |
| 1. Ingest | `agents/sources/insert_manual_cafes.py` | Manual/IG entries (dry-run by default) |
| 2. Prepare | `agents/prepare/recheck_place_ids.py` | Places API lookup (dry-run by default, add `--apply`) |
| 2. Prepare | `agents/prepare/dedupe_cafes.py` | Marks `duplicate_of`, not hard-delete |
| 2. Prepare | `agents/prepare/cleanup_cafes.py` | Deletes marked records (add `--yes`) |
| 3. Enrich | `agents/enrich/google_scraper.py` | Playwright scraper; saves to `data/reviews/<place_id>.json` |
| 3. Enrich | `agents/enrich/google_photos_scraper.py` | Playwright; clicks cover → photos page, sweeps「全部」for 15 photos → R2 → `cafes.cover_image_url` + `cafes.photos[14]` |
| 4. LLM | `agents/process/google_extract.py` | Reads `data/reviews/*.json` → `reviews_raw.extracted_signals` |
| 4. LLM | `agents/sources/instagram_extract.py` | Reads `data/ig/*.txt` → signals |
| 5. Tags | `agents/process/semantic.py` | Merges signals into `cafe_tags` / `tag_evidence` |

`agents/process/google_places.py` — **not a runnable pipeline step**; it holds the shared LLM `Signal` model and `SYSTEM_PROMPT` used by steps 4a/4b.

### Core modules

- `config.py` / `db.py` — Supabase client (singleton via `lru_cache`), env via pydantic-settings
- `llm.py` — LLM JSON helper (OpenRouter/OpenAI)
- `storage.py` — Uploads cover images to Cloudflare R2

### Environment variables

Copy `.env.example`. Required per stage:
- **Steps 1–3**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Steps 2–3**: `GOOGLE_PLACES_API_KEY`
- **Step 4**: `OPENROUTER_API_KEY` (+ optionally `OPENROUTER_MODEL`, default `deepseek/deepseek-v4-flash:free`)

---

## Web Frontend

### Commands (run from `web/`)

```bash
npm run dev          # start Vite dev server
npm run build        # tsc + vite build
npm run typecheck    # tsc --noEmit only
```

### Architecture

- **React 18** + **React Router v6** + **TanStack Query v5** + **Mapbox GL v3**
- **Tailwind CSS v3** + **DaisyUI v4** for styling
- **HugeIcons** for icons

#### Routing strategy

`App.tsx` splits routes at the top level by `useIsDesktop()`:
- **Mobile**: separate pages (`HomePage`, `MapPage`, `FilterPage`, `CafeDetailPage`, etc.)
- **Desktop**: single `DesktopApp` shell — `SearchSidebar` + collapsible middle panel + `CafeMap` never unmount, avoiding Mapbox re-init flicker. `activeId` is driven by URL match (`/cafe/:id`).

#### Component layout

```
components/
  layout/     # Topbar, MobileTabBar, DesktopPageLayout, Responsive
  search/     # SearchSidebar, CafeMap, DesktopFilterPanel, FilterChipBar, CafeListItem
  cafe/       # CafeDetailContent, TagConfidenceRow
  primitives/ # CustomSelect, TagBadge, TagChip, Cap, Placeholder
pages/        # one file per route
hooks/        # useAuth, useSearchSelection
data/         # filterTags.ts (shared tag definitions), mockCafes.ts (placeholder data)
lib/          # supabase.ts, mapbox.ts, clsx.ts
types/        # cafe.ts (CafeCard, CafeDetail, PlatformTagKey — backend contract)
```

#### Tag system

`web/src/data/filterTags.ts` defines all UI filter tags (key/label). `web/src/types/cafe.ts` defines `PlatformTagKey` — this is the contract between the backend `cafe_tags` table and the frontend. When adding a new tag, update both files and `specs/semantic_layer.yaml`.

#### Current state

The frontend uses **mock data** (`data/mockCafes.ts`). Supabase Edge Functions (`search-cafes`, `cafe-detail`) are planned but not yet wired in.

---

## Semantic Layer

`specs/semantic_layer.yaml` is the canonical definition of all platform tags, their types (`boolean`, `score`, `structured`), source mappings, and LLM extraction rules. When changing tag behaviour, update this file first.

Tag aggregation rules (in `process/semantic.py`):
- **Boolean** tags: majority vote; community edits override
- **Score** tags (`study_friendly`, etc.): positive/negative signal sum, clipped 0–100
- **Structured** tags (`time_limit`): canonical value by source priority
- Tags with `locked_by_community=true` are never auto-overwritten

`noise_level` is stored as **quietness** (5 = silent, 1 = loud) despite the name — all three sources follow the same direction.
