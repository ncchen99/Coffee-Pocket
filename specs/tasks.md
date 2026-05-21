# Coffee Pocket — 開發任務清單

依優先順序整理。前期重點是**先把 Semantic Layer 與資料管線打穩**,再做 UI。
任務分四大塊:資料管線 (Python)、Supabase 後端 (DB + Edge Functions + Auth)、前端 (React + daisyUI + Hugeicons)、跨階段營運。
前端任務逐頁對應 [designs/wireframes/pages/](../designs/wireframes/pages/) 與既有 `wf-*.jsx` wireframe。

## Phase 0:規格與資料骨架

- [x] 撰寫產品需求書 (requirements.md)
- [x] 定義 Semantic Layer v1.0 (SPEC.md)
- [x] 定義資料來源 Agents 與 LLM Pipeline (AGENTS.md)
- [x] 將 SPEC.md 中的 YAML 拆出為獨立檔 `specs/semantic_layer.yaml`
- [x] 設計 Supabase schema migration → `supabase/migrations/0001_init_semantic_layer.sql`
- [x] 補上 cafes 表的 google meta / cover image / duplicate_of 欄位 (migrations 0002–0004)
- [x] 撰寫 wireframe 描述 (`designs/wireframes/pages/*.md`)
- [x] 鎖定前後端選型 (requirements.md §8)

---

## Phase 1:資料管線 (後端 Python · 現況)

- [x] **Agents 目錄分層**:`sources` / `prepare` / `enrich` / `process` / `maintenance` / `shared`
- [x] **CafeNomad Agent**:`coffee_pocket.agents.sources.cafenomad` 抓取臺南清單並映射至 Raw Signals
- [x] **Google Maps Enrichment**:`coffee_pocket.agents.enrich.google_scraper` 抓評論與店家資訊
- [x] **Google Places / LLM Process**:`coffee_pocket.agents.process.google_extract` 分批 LLM 萃取
- [x] **Semantic Agent**:`coffee_pocket.agents.process.semantic` 彙整 signals → product tags (含 confidence / evidence)
- [ ] 排程 (pg_cron 或外部 cron):Cafe Nomad 每週、Google 每 2–4 週
- [ ] LLM JSON schema validator + dead letter table

---

## Phase 2:Supabase 後端 (DB + Auth + Edge Functions)

### 2.1 Auth

- [x] 啟用 Supabase Auth Google OAuth (對應 [login.md](../designs/wireframes/pages/login.md))
- [~] ~~啟用 Apple OAuth (iOS PWA / 行動端)~~ — 決定不做
- [x] `users` 表觸發器:auth.users → public.users (自動同步 display_name / avatar)
- [x] RLS 政策:`cafes` / `cafe_tags` / `tag_evidence` public read;`edits` / `pockets` / `pocket_items` / `tag_votes` / `reports` owner-only write;`sources` / `dead_letter` service-role only;`public_user_profiles` view 暴露安全的 user 子集 (見 migrations 0001 / 0005 / 0013–0016)

### 2.2 Schema 補完

- [x] `pockets` (id, user_id, name, emoji, sort_order)
- [x] `pocket_items` (pocket_id, cafe_id, personal_note, added_at)
- [x] `edits` 擴充:status (pending / approved / rejected)、reviewer_id、reviewed_at、source_url / source_image
- [x] `tag_votes` (cafe_id, tag_key, user_id, vote, created_at) — 對應 [cafe-detail](../designs/wireframes/pages/cafe-detail.md) 與 [cafe-edit](../designs/wireframes/pages/cafe-edit.md) 的標籤投票
- [x] `reports` (cafe_id, reporter_id, type: closed/duplicate/wrong, note)

### 2.3 Edge Functions (Deno)

> 統一放 `supabase/functions/<name>/index.ts`。Edge Function 只做 thin layer,重活留給 Postgres / Python worker。

- [x] `search-cafes` — 多標籤交叉 + PostGIS 距離 + 時間 + 排序;input: `{tags, center, radius_km, at_time, sort}` → 直接走 SQL RPC `cafes_search`,< 200ms
- [x] `cafe-detail` — 直接走 SQL RPC `cafe_detail(uuid)` (migrations 0006 / 0015),含 tags + evidence count + 即時營業狀態;AI 摘要欄位待 Phase 4 pipeline 填入
- [x] `submit-edit` — 寫入 `edits` (pending),回傳 ticket id ([supabase/functions/submit-edit/index.ts](../supabase/functions/submit-edit/index.ts))
- [ ] `submit-cafe` — 新店家送審 + 觸發後端 AI 標籤 pipeline ([cafe-add.md](../designs/wireframes/pages/cafe-add.md))
- [x] `vote-tag` — 對標籤 👍/👎,寫入 `tag_votes` ([supabase/functions/vote-tag/index.ts](../supabase/functions/vote-tag/index.ts));連續 N 次 👎 後顯示「直接修」CTA 的前端邏輯尚未做
- [ ] `ai-summary` — 呼叫 LLM 生成情境式摘要,結果 cache 進 `cafes.ai_summary` (TTL 3000 天);Edge Function 只負責 cache 命中 / 失誤調用
- [ ] `nearby-resolve` — 反向地理:lat/lng → 臺南行政區名稱 (定位失敗 fallback 用,見 [empty-error.md](../designs/wireframes/pages/empty-error.md))
- [x] `export-pocket` — 匯出單一使用者的所有 pockets → JSON ([supabase/functions/export-pocket/index.ts](../supabase/functions/export-pocket/index.ts))
- [x] `delete-account` — GDPR 級刪除:auth.users + 級聯清掉 pockets / edits / votes ([supabase/functions/delete-account/index.ts](../supabase/functions/delete-account/index.ts))
- [x] (Optional) `report-issue` — 寫入 `reports`,管理員後台處理 ([supabase/functions/submit-report/index.ts](../supabase/functions/submit-report/index.ts))
- [x] `parse-prompt` — 自然語意 → 搜尋條件解析 ([supabase/functions/parse-prompt/index.ts](../supabase/functions/parse-prompt/index.ts))

### 2.4 PostGIS / SQL 層

- [x] SQL function `cafes_search(...)` — §2.3 主邏輯下推到 SQL (migrations 0006 → 0007 → 0011 → 0013,含時間過濾、OR-tag、無限半徑)
- [x] SQL function `cafe_open_at(jsonb, timestamptz)` — 解析營業時間 JSON,回傳當下是否開 (migrations 0006 / 0012)
- [ ] Tag confidence threshold:strict / loose 兩種模式
- [ ] Materialized view `cafe_card` — 列表用的精簡欄位 (id, name, cover, top_tags, distance) 提升列表查詢效能

---

## Phase 3:前端 (React + Tailwind + daisyUI + Hugeicons)

### 3.1 專案 / 設計系統

- [x] Vite + React + TypeScript 專案骨架
- [x] Tailwind + daisyUI 安裝;custom theme `coffee-paper` / `coffee-roast` 對應 requirements §4.2
- [x] Hugeicons 安裝 (`@hugeicons/react` + `@hugeicons/core-free-icons`),建立 `<Icon name="..." />` 包裝
- [x] 沿用 `wf-primitives.jsx` 的概念元件 → 改寫成正式 React component:`Pill` / `Divider` / `Ann` / `Box` / `MobileFrame` / `Cap`
- [x] React Router 結構,layout = MobileShell / DesktopShell (媒體查詢切換)
- [x] React Query client + Supabase client (`@supabase/supabase-js`) 設定
- [x] Auth Context (Supabase Auth session listener)
- [ ] i18n 基礎 (zh-TW / en) — 文案集中

### 3.2 頁面實作 (對應 wireframe)

- [x] **Onboarding** — 3 頁 carousel + localStorage `onboarded_at` ([onboarding.md](../designs/wireframes/pages/onboarding.md))
- [x] **Home / 搜尋入口** — 移植 `wf-home.jsx` 為實際組件,接 `search-cafes`
- [x] **Mobile 地圖 + Bottom Sheet** — 移植 `wf-mobile.jsx`,Mapbox + react-spring drag
- [x] **Desktop 左列右地圖** — 移植 `wf-desktop.jsx`,Mapbox + 同步 hover state
- [x] **Advanced Filter** — 多 tag chip + 即時筆數 ([advanced-filter.md](../designs/wireframes/pages/advanced-filter.md));每改一項 debounce 200ms 重打 `search-cafes`
- [x] **Cafe Detail** — sticky topbar + hero carousel + 即時營業狀態 + evidence drawer ([cafe-detail.md](../designs/wireframes/pages/cafe-detail.md))
- [ ] **Cafe Edit** — diff 視覺化 + 來源附件 ([cafe-edit.md](../designs/wireframes/pages/cafe-edit.md));打 `submit-edit` (頁面尚未實作)
- [ ] **Cafe Add** — 3 步驟 + Google Places autocomplete ([cafe-add.md](../designs/wireframes/pages/cafe-add.md));打 `submit-cafe` (頁面尚未實作)
- [x] **Pocket List** — chip 切換不同口袋 + 列表 / 地圖 view toggle ([pocket-list.md](../designs/wireframes/pages/pocket-list.md))
- [x] **Login** — Supabase Auth modal,Google + Apple ([login.md](../designs/wireframes/pages/login.md))
- [x] **Profile** — 統計 + 貢獻 timeline ([profile.md](../designs/wireframes/pages/profile.md))
- [x] **Settings** — 即時生效;主題透過 daisyUI `data-theme` 切;呼叫 `export-pocket` / `delete-account` ([settings.md](../designs/wireframes/pages/settings.md))
- [ ] **Empty / Error 元件** — 6 場景共用 `<EmptyState icon=... title=... primary=... secondary=... />` ([empty-error.md](../designs/wireframes/pages/empty-error.md))

### 3.3 跨頁互動

- [x] 地圖 Marker ↔ 列表 hover 同步 (Desktop)
- [x] Bottom Sheet 三段式 (peek / half / full),手勢 + 鍵盤可達 (Mobile)
- [ ] Toast / 通知系統 (daisyUI `toast`)
- [x] Skeleton loading (daisyUI `skeleton`) 取代 spinner
- [x] 全站 dark mode 切換 (`data-theme` + 系統偵測)

---

## Phase 4:AI 摘要與個人化

- [ ] **AI 摘要產生 pipeline** (Python pipeline，寫入 `cafes.summary_ai` 欄位)
  - 目前 `summary_ai` 全為 null;前端在資料庫串接階段先跳過此區塊不顯示
  - 待 pipeline 完成後，前端 cafe detail 頁的 AI 摘要區塊會自動顯示
- [ ] AI 摘要 caching (Edge Function `ai-summary` + Postgres 欄位)
- [ ] Instagram Agent (文本 + 可選圖片 Vision)
- [ ] 個人化推薦:從使用者的 pocket 內容與點擊紀錄建模偏好
- [ ] 聚會模式:輸入人數 + 時間 + 需求 → 推薦 (新 Edge Function `recommend-gathering`)
- [ ] 「今天去哪」探索模式 (每日輪播 3 間,類 Spotify Discover)

---

## 跨階段事項

- [ ] **可觀測性**:Edge Function 加 structured logging,Supabase Logs explorer 建 saved query
- [ ] **成本監控**:Google Places / LLM token 計量;每月 dashboard
- [ ] **內容稽核流程**:社群編輯 vs AI 標籤的衝突仲裁規則 (人 > AI > 投票多數)
- [ ] **Rate limiting**:Edge Function `submit-*` 走 Supabase rate-limit middleware
- [ ] **CI**:GitHub Actions — Python lint/test + 前端 typecheck + Edge Function 部署
- [ ] **PWA**:離線可看快取的 pocket list ([empty-error 網路錯誤 fallback](../designs/wireframes/pages/empty-error.md#3--網路錯誤))
- [ ] **A11y**:鍵盤導覽、焦點環、aria-label;daisyUI 已有基底,但 Mapbox / Bottom Sheet 要補
