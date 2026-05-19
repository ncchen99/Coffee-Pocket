# Coffee Pocket — 技術規格（Semantic Layer）

本文件定義 Coffee Pocket 的**核心語意層（Cafe Semantic Layer）**，
亦即「LLM 要如何理解一間咖啡廳」的格式化規範。

## 1. 設計理念

不同資料來源（Google Maps 評論、Instagram、Cafe Nomad、社群編輯）描述方式各異，
本層的任務是把異質訊號轉成統一的產品標籤。

採用三層架構：

```
原始資料層（Raw Signals）
        ↓
語意判斷層（Semantic Interpretation）
        ↓
最終產品標籤層（Product Tags）
```

範例：

```
「桌子很大」+「很多人在用電腦」+「有插座」
        ↓  LLM 判斷
適合讀書辦公 = true
```

這樣未來才能：擴充來源、替換 LLM、新增規則、調整權重，
而不需重構整個系統。

## 2. 系統架構

| 層            | 技術                          | 職責                                              |
| ------------- | ----------------------------- | ------------------------------------------------- |
| 地圖渲染      | Mapbox                        | 地圖、Marker、互動                                |
| 主資料庫      | Supabase (PostgreSQL+PostGIS) | 店家、標籤、使用者、社群編輯、AI 結果、地理查詢   |
| 補充資料來源  | Google Places API             | 評論、營業時間、初始資料                          |
| 既有資料來源  | Cafe Nomad API v1.2           | 臺南咖啡廳基礎欄位                                |
| 內容資料來源  | Instagram                     | 美食帳號的觀察文本與圖片                          |
| 語意處理      | LLM Pipeline                  | 將異質訊號轉換為標準化標籤（見 AGENTS.md）         |

## 3. 核心產品標籤（Semantic Layer v1.0）

完整 YAML 定義已抽出至獨立檔案：[`specs/semantic_layer.yaml`](./semantic_layer.yaml)。

目前 v1.0 收錄的 platform_tags：

| key | 類型 | 用途 |
| --- | --- | --- |
| `socket_available` | boolean | 是否有插座（需 ≥ 2 來源、confidence ≥ 0.7） |
| `study_friendly` | score (0–100) | 適合讀書 / 辦公 |
| `discussion_friendly` | score (0–100) | 適合聚會 / 討論 |
| `time_limit` | structured | 限時規則（unlimited / conditional / limited + 分鐘） |

新增標籤的步驟：

1. 在 `semantic_layer.yaml` 補上 `display_name`、`type`、`source_mapping`、`confidence_rules`
2. 若需要新欄位，更新 `cafe_tags` schema 並寫 migration
3. 同步更新 [AGENTS.md](./AGENTS.md) 的萃取規則

## 4. 共通輔助欄位（每個標籤都應附帶）

```yaml
evidence:
  - source: google_review
    text: "每桌都有插座，很適合工作"
    confidence: 0.92
    review_id: <uuid>

confidence_score: 0.84
last_verified_at: 2026-05-18
```

設計理由：

- **evidence**：使用者能追溯「為什麼被標成適合工作」；避免 AI hallucination；管理員可修正
- **confidence_score**：AI 判斷有模糊性，需可視化可信度
- **last_verified_at**：咖啡廳規則易變（今天有插座、明天可能拆掉）

## 5. 資料庫核心 Schema 概念（Supabase / PostgreSQL）

> 僅列概念，正式 migration 規格待後續定義。

- `cafes`：基本資訊、地理座標（PostGIS `geography`）、營業時間 JSON
- `cafe_tags`：店家 → 標籤（含 score、confidence、last_verified_at）
- `tag_evidence`：每筆 evidence（source、text、confidence、原始 ID）
- `reviews_raw`：抓回來尚未語意化的評論 / 貼文
- `users`、`edits`：社群登入與編輯紀錄
- `sources`：來源註冊（google_places / cafe_nomad / instagram / community）

## 6. 標籤命名規範

- 內部 key：snake_case ASCII（e.g. `socket_available`）
- 對外顯示：透過 `display_name.zh` / `display_name.en` 切換
- 新增標籤時必須同時補：source_mapping、confidence_rules、evidence schema
