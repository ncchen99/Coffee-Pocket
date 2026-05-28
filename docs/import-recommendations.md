# 批次匯入使用者推薦的咖啡廳

`coffee_pocket.agents.sources.import_recommendations` 是給站長手動執行的腳本，
把使用者在 App 上推薦（寫入 `cafe_recommendations` 表）的咖啡廳，批次匯入
`cafes` 表並跑完整個 enrichment pipeline。

## 為什麼需要這個腳本

前端的「推薦咖啡廳」流程刻意不直接觸發 pipeline——pipeline 每次要跑
Playwright + LLM 幾分鐘 + 花 API 費用，任何登入使用者都能觸發太容易被濫用。
所以前端只把選到的店家寫進 `cafe_recommendations`，由站長定期跑這個腳本批次處理。

對應的資料表定義：[supabase/migrations/0033_cafe_recommendations.sql](../supabase/migrations/0033_cafe_recommendations.sql)

## 它做什麼

讀取 `cafe_recommendations` 表中 `status='pending'` 的紀錄，逐筆處理：

1. **已存在於 `cafes` 表** → 直接把這筆推薦標成 `imported`（連到既有 `cafe_id`），
   不重跑 pipeline。
2. **不存在** →
   - Insert 新一列到 `cafes`，`source='user_submitted'`
   - 依序跑：`pinyin` → `scrape` → `photos` → `extract` → `semantic` → `ai_summary`
   - 成功則把推薦標成 `imported`、寫入 `imported_cafe_id` / `imported_at`
   - Pipeline 失敗則 `cafes` 列會保留（下次重跑時當作「已存在」直接標 imported，
     或站長手動跑單一 cafe 的修補 stage）；推薦的 `status` 維持 `pending`

> `photos` 和 `ai_summary` 失敗不算整體失敗——cover 在 `scrape` 階段已有 fallback，
> 摘要少了不至於擋住地圖上線。其他 stage 失敗就終止這筆。

## 前置需求

- `uv` 已安裝、`uv sync` 過
- `.env` 設好以下變數（同 pipeline 其他 stage 的需求）：
  - `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（service role 才能 bypass RLS 寫 cafes）
  - `GOOGLE_PLACES_API_KEY`（scrape stage 會用到 place details）
  - `OPENROUTER_API_KEY`（extract / semantic / ai_summary 需要）
- Playwright 的 Chromium 已裝（`uv run playwright install chromium`）

## 使用方式

### 預覽要處理哪些（dry-run）

```bash
uv run python -m coffee_pocket.agents.sources.import_recommendations
```

會印出待處理數量、每筆是「已在 cafes」還是「會匯入」，**不會**寫任何東西。
跑這個之前一定先看一次。

### 實際匯入

```bash
uv run python -m coffee_pocket.agents.sources.import_recommendations --apply
```

每筆都會在 console stream 出 pipeline 各 stage 的 log。整批跑完會印出總結
（已存在 / 成功 / 失敗筆數）。

### 限制單次處理數

Pipeline 一筆要幾分鐘，待處理很多時可以分批：

```bash
uv run python -m coffee_pocket.agents.sources.import_recommendations --apply --limit 5
```

按 `created_at` 由舊到新處理，下次再跑會接著從未處理的繼續。

## 常見情境

### 想跳過某筆推薦（不適合 / 重複）

直接在 DB 把那筆 `status` 改成 `skipped`：

```sql
update cafe_recommendations
set status = 'skipped'
where id = '<recommendation-id>';
```

之後 `--apply` 就不會再撈到它。

### 某筆 pipeline 中途失敗想重跑

`cafes` 列已經寫進去了，所以下次跑 `--apply` 時這筆會被當作「已存在」直接標
`imported`，不會再跑 pipeline。如果想補跑那筆的某個 stage，請手動執行對應的
module（例如 `coffee_pocket.agents.enrich.google_scraper --cafe-id <uuid>
--update-cafe`），參考 [data-pipeline.md](data-pipeline.md)。

### 想看歷史處理狀況

```sql
select status, count(*)
from cafe_recommendations
group by status;

-- 最近匯入的
select name, status, imported_at, imported_cafe_id
from cafe_recommendations
where status = 'imported'
order by imported_at desc
limit 20;
```

## 故障排除

| 症狀 | 可能原因 |
|---|---|
| `failed to insert cafe for recommendation ...` | 多半是 RLS／service role key 沒設對。確認 `SUPABASE_SERVICE_ROLE_KEY` 是 service role 而不是 anon。 |
| `stage=scrape FAILED` | Playwright 跑不起來；先單獨跑 `uv run python -m coffee_pocket.agents.enrich.google_scraper --cafe-id <uuid> --update-cafe` 看完整 trace。 |
| `stage=extract FAILED` | OpenRouter 沒 quota 或 model 不存在；檢查 `OPENROUTER_API_KEY` 與 `OPENROUTER_MODEL`。 |
| 跑一跑卡住超過 15 分鐘 | 單一 stage 上限 15 分鐘會自動 kill，這通常是 Google Maps 風控；隔一陣再試或換 IP。 |
