# Coffee Pocket

Coffee Pocket 目前的重點是整理臺南咖啡廳資料，先把不同來源匯入資料庫，再用 Google Places / Google Maps 補齊名稱、Place ID、評論與店家資訊。

目前流程已改成「每個步驟分開跑」。舊版 `google_places.py` 會同時做 Places 查詢、抓少量評論、再丟 LLM 萃取；這條一站式流程現在先暫停使用，避免資料更新、評論爬取、LLM 處理混在一起。

## 目前流程

### 1. 取得資料與匯入

先把不同來源的咖啡廳資料放進 `cafes` / `reviews_raw`。

1. 抓 Cafe Nomad 臺南資料：

   ```bash
   uv run python -m coffee_pocket.agents.sources.cafenomad
   ```

2. 匯入 Google 地圖清單，參考臺南清單腳本：

   ```bash
   uv run python -m coffee_pocket.agents.sources.tainan_list --headful
   uv run python -m coffee_pocket.agents.sources.tainan_list --from-json --write-db
   ```

   第一行會打開 Google Maps 清單並輸出 `data/tainan_list.json`。確認 JSON 內容後，再用第二行寫入資料庫。

3. 匯入 IG / 手動整理資料：

   目前手動清單放在 `insert_manual_cafes.py` 裡的 `CAFES`，資料來源可參考 `data/ig/greenyaya.314.txt`。

   ```bash
   uv run python -m coffee_pocket.agents.sources.insert_manual_cafes
   uv run python -m coffee_pocket.agents.sources.insert_manual_cafes --apply
   ```

   第一行只預覽，第二行才寫入資料庫。

### 2. 資料更新與清理

資料進資料庫後，再分開做 Place API 更新、重複檢查、刪除。

1. 使用 Google Places API 更新咖啡廳名稱與 Place ID：

   ```bash
   uv run python -m coffee_pocket.agents.prepare.recheck_place_ids
   uv run python -m coffee_pocket.agents.prepare.recheck_place_ids --apply
   ```

   如果只想處理剛匯入、還沒有 `google_place_id` 的店家：

   ```bash
   uv run python -m coffee_pocket.agents.prepare.recheck_place_ids --only-missing-pid --apply
   ```

2. 檢查是否有重複資料：

   ```bash
   uv run python -m coffee_pocket.agents.prepare.dedupe_cafes
   uv run python -m coffee_pocket.agents.prepare.dedupe_cafes --apply
   ```

   這支腳本會先把重複資料標記成 `duplicate_of`，不是直接刪除。

3. 刪除被標記為重複或找不到的資料：

   ```bash
   uv run python -m coffee_pocket.agents.prepare.cleanup_cafes
   uv run python -m coffee_pocket.agents.prepare.cleanup_cafes --yes
   ```

   第一行只預覽，第二行才刪除。

### 3. 資訊補充

最後再跑 Google Maps 爬蟲補齊評論、營業資訊、評分、照片等內容。

```bash
uv run python -m coffee_pocket.agents.enrich.google_scraper --limit 5 --headful --update-cafe
```

常用模式：

```bash
# 第一次使用前，先登入 Google，讓瀏覽器保存登入狀態
uv run python -m coffee_pocket.agents.enrich.google_scraper --login

# 只補 Place ID，不爬評論
uv run python -m coffee_pocket.agents.enrich.google_scraper --resolve-only

# 跳過還沒有 google_place_id 的店家，只爬已確認的店
uv run python -m coffee_pocket.agents.enrich.google_scraper --no-missing --update-cafe
```

爬蟲會把評論與店家資訊存到 `data/reviews/<google_place_id>.json`。加上 `--update-cafe` 時，也會把可用的 Google 店家資訊寫回 `cafes`。

## `src` 腳本分類

`src/coffee_pocket/agents` 已依階段拆成子資料夾：

```text
agents/
  sources/      # Step 1：資料來源匯入
  prepare/      # Step 2：Place ID 更新、重複檢查、清理
  enrich/       # Step 3：Google Maps 爬蟲與資訊補充
  process/      # 暫停中的 LLM / semantic 處理
  maintenance/  # 一次性修復與稽核工具
  shared/       # 跨階段共用工具
```

### 現行主流程

| 階段 | 檔案 | 用途 | 狀態 |
| --- | --- | --- | --- |
| 1. 取得資料與匯入 | `src/coffee_pocket/agents/sources/cafenomad.py` | 抓 Cafe Nomad 臺南資料，寫入 `cafes` / `reviews_raw` | 使用中 |
| 1. 取得資料與匯入 | `src/coffee_pocket/agents/sources/tainan_list.py` | 匯入 Google Maps 臺南清單 | 使用中 |
| 1. 取得資料與匯入 | `src/coffee_pocket/agents/sources/insert_manual_cafes.py` | 匯入手動整理的 IG / 人工清單 | 使用中 |
| 2. 資料更新與清理 | `src/coffee_pocket/agents/prepare/recheck_place_ids.py` | 用 Places API 更新名稱、Place ID，並標記可疑重複 | 使用中 |
| 2. 資料更新與清理 | `src/coffee_pocket/agents/prepare/dedupe_cafes.py` | 互動式檢查重複店家，標記 `duplicate_of` | 使用中 |
| 2. 資料更新與清理 | `src/coffee_pocket/agents/prepare/cleanup_cafes.py` | 刪除 `not_found` 與 `duplicate_of` 資料 | 使用中 |
| 3. 資訊補充 | `src/coffee_pocket/agents/enrich/google_scraper.py` | 爬 Google Maps 評論與店家資訊 | 使用中 |
| 共用 | `src/coffee_pocket/agents/shared/places_lookup.py` | Places API 共用查詢工具 | 使用中，輔助模組 |
| 共用 | `src/coffee_pocket/storage.py` | 上傳 Google 店家封面圖到 R2 | 使用中，輔助模組 |
| 共用 | `src/coffee_pocket/config.py` / `db.py` | 環境變數與 Supabase 連線 | 使用中，基礎模組 |

### 暫停使用或舊流程

| 檔案 | 原本用途 | 現在狀態 |
| --- | --- | --- |
| `src/coffee_pocket/agents/process/google_places.py` | 舊版一站式 Google Places 流程：查 Place ID、抓 API 回傳的少量評論、跑 LLM | 沒有用在目前主流程；保留作為 schema / prompt 參考 |
| `src/coffee_pocket/agents/process/google_extract.py` | 讀取 `data/reviews/*.json` 後，把評論寫入 `reviews_raw` 並跑 LLM | 目前主流程沒有跑 LLM；暫停使用 |
| `src/coffee_pocket/agents/sources/instagram_extract.py` | 讀取 IG 文字檔，匹配店家並可選擇跑 LLM | 目前只作為實驗 / 備用；若只要匯入手動店家清單，優先用 `insert_manual_cafes.py` |
| `src/coffee_pocket/agents/process/semantic.py` | 彙整 `reviews_raw.extracted_signals` 成 `cafe_tags` / `tag_evidence` | LLM / semantic layer 流程暫停時不需要跑 |
| `src/coffee_pocket/llm.py` | OpenRouter JSON LLM helper | 只有舊 LLM 流程會用到 |

### 一次性修復或稽核工具

這些檔案不是日常流程的一部分，先保留，避免之後需要追查資料修復歷史時找不到工具。

| 檔案 | 用途 | 狀態 |
| --- | --- | --- |
| `src/coffee_pocket/agents/maintenance/audit_place_matches.py` | 稽核既有 `google_place_id` 是否疑似配錯店 | 必要時才跑 |
| `src/coffee_pocket/agents/maintenance/restore_dedup_cafe_nomad.py` | 還原 dedupe 後遺失的 Cafe Nomad 資料 | 一次性修復 |
| `src/coffee_pocket/agents/maintenance/restore_post_dedup.py` | 修復 dedupe 後被覆寫 / 被刪光的資料 | 一次性修復 |

### 依賴關係

- `sources/tainan_list.py` 會共用 `enrich/google_scraper.py` 裡的瀏覽器啟動工具。
- `sources/insert_manual_cafes.py`、`prepare/recheck_place_ids.py`、`enrich/google_scraper.py`、`maintenance/audit_place_matches.py` 都依賴 `shared/places_lookup.py`。
- `maintenance/restore_dedup_cafe_nomad.py` 依賴 `sources/cafenomad.py`。
- `maintenance/restore_post_dedup.py` 依賴 `sources/cafenomad.py`、`shared/places_lookup.py`、`process/semantic.py`。
- `sources/instagram_extract.py` 與 `process/google_extract.py` 仍引用 `process/google_places.py` 的 LLM schema / prompt；目前主流程暫停 LLM 時不要跑。

## 建議保留與刪除

保留：

- 現行主流程腳本。
- Places API 共用工具與 Supabase / R2 基礎模組。
- 一次性修復腳本，因為它們記錄了資料修復邏輯，日後查問題可能用得到。

暫時不要跑：

- `agents/process/google_places.py`
- `agents/process/google_extract.py`
- `agents/sources/instagram_extract.py` 的 LLM 模式
- `agents/process/semantic.py`

可以直接清掉：

- `__pycache__/`
- `*.pyc`
- 本機臨時 log，但 `data/audit/*.log` 若需要追查歷史可先保留。

## 環境設定

需要的環境變數可參考 `.env.example`：

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
GOOGLE_PLACES_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
```

目前主流程如果不跑 LLM，`OPENROUTER_API_KEY` 可以先不填。`agents/prepare/recheck_place_ids.py` 和 `agents/enrich/google_scraper.py` 的 Place ID 補齊會需要 `GOOGLE_PLACES_API_KEY`。

## 檢查方式

目前專案沒有獨立的測試資料夾；整理腳本分類後，先用模組匯入檢查確認所有新路徑與依賴都能載入：

```bash
uv run python - <<'PY'
import importlib

modules = [
    "coffee_pocket.agents.sources.cafenomad",
    "coffee_pocket.agents.sources.tainan_list",
    "coffee_pocket.agents.sources.insert_manual_cafes",
    "coffee_pocket.agents.prepare.recheck_place_ids",
    "coffee_pocket.agents.prepare.dedupe_cafes",
    "coffee_pocket.agents.prepare.cleanup_cafes",
    "coffee_pocket.agents.enrich.google_scraper",
    "coffee_pocket.agents.shared.places_lookup",
    "coffee_pocket.agents.process.google_places",
    "coffee_pocket.agents.process.google_extract",
    "coffee_pocket.agents.process.semantic",
    "coffee_pocket.agents.sources.instagram_extract",
    "coffee_pocket.agents.maintenance.audit_place_matches",
    "coffee_pocket.agents.maintenance.restore_dedup_cafe_nomad",
    "coffee_pocket.agents.maintenance.restore_post_dedup",
]

for name in modules:
    importlib.import_module(name)

print("ok")
PY
```
