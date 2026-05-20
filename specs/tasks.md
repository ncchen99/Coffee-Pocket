# Coffee Pocket — 開發任務清單

依優先順序整理。前期重點是**先把 Semantic Layer 與資料管線打穩**，再做 UI。

## Phase 0：規格與資料骨架

- [x] 撰寫產品需求書（requirements.md）
- [x] 定義 Semantic Layer v1.0（SPEC.md）
- [x] 定義資料來源 Agents 與 LLM Pipeline（AGENTS.md）
- [x] 將 SPEC.md 中的 YAML 拆出為獨立檔 `specs/semantic_layer.yaml`
- [x] 設計 Supabase schema migration（cafes / cafe_tags / tag_evidence / reviews_raw / users / edits / sources / dead_letter）→ `supabase/migrations/0001_init_semantic_layer.sql`

## Phase 1：資料管線（後端優先）

- [x] **Agents 目錄分層**：`sources` / `prepare` / `enrich` / `process` / `maintenance` / `shared`
- [ ] **CafeNomad Agent**：`coffee_pocket.agents.sources.cafenomad` 抓取臺南清單並映射至 Raw Signals
- [ ] **Google Maps Enrichment**：`coffee_pocket.agents.enrich.google_scraper` 抓評論與店家資訊
- [ ] **Google Places / LLM Process**：`coffee_pocket.agents.process.google_extract` 分批 LLM 萃取（目前主流程暫停）
- [ ] **Semantic Agent**：`coffee_pocket.agents.process.semantic` 彙整 signals → product tags（含 confidence、evidence，目前主流程暫停）
- [ ] **Community Edit** 基礎：Google 登入 + 編輯權限 + 歷史紀錄
- [ ] 排程更新（Cafe Nomad 每週、Google 每 2–4 週）

## Phase 2：搜尋與篩選 API

- [ ] PostGIS 距離查詢（slider 對應半徑）
- [ ] 時間篩選（指定日期 / 時間，排除未營業店家）
- [ ] 多標籤交叉篩選 + 排序（距離 / 評分 / 安靜 / 適合工作）
- [ ] 標籤 confidence threshold 控制（是否要嚴格 / 寬鬆模式）

## Phase 3：前端 UI（Flat Design）

- [ ] 設計系統：Light / Dark 配色、分割線、字級、間距
- [ ] Desktop layout：左列表 + 右地圖（Mapbox）
- [ ] Mobile layout：地圖 + Bottom Sheet
- [ ] 篩選器 UI：標籤 chip、距離 slider、時間選擇
- [ ] 店家詳情頁：標籤 + evidence 顯示 + 編輯入口

## Phase 4：AI 摘要與個人化

- [ ] AI 摘要：「適合 2–4 人聊天」「下午容易客滿」⋯⋯
- [ ] Instagram Agent（文本 + 可選圖片 Vision）
- [ ] 個人化推薦（偏好建模）
- [ ] 聚會模式（人數 + 時間 + 需求 → 推薦）
- [ ] 「今天去哪」探索模式

## 跨階段事項

- [ ] LLM JSON schema validator + dead letter
- [ ] Prompt caching 規劃（system prompt 含 SPEC 摘要固定化）
- [ ] 成本監控（Google Places / LLM token）
- [ ] 內容稽核流程（社群編輯 vs AI 標籤的衝突仲裁）
