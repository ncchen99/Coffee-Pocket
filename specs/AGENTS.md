# Coffee Pocket — LLM Pipeline 與資料代理（Agents）

定義各資料來源如何流經 LLM 處理，最終寫入 Semantic Layer（見 SPEC.md）。

## 1. 整體流程

```
[ 來源抓取 ] → [ 正規化 Raw Signals ] → [ LLM 語意判斷 ] → [ 信心彙整 ] → [ 寫入 Semantic Layer ]
```

每個來源都有對應的 Agent，輸出**標準化的 Raw Signals**，
再由共用的 Semantic Agent 推導最終標籤。

## 2. 來源 Agents

### 2.1 CafeNomad Agent（結構化欄位映射）

來源：`https://cafenomad.tw/api/v1.2/cafes/tainan`

任務：將 Cafe Nomad 的離散欄位直接映射到 Raw Signals，**不需 LLM**。

| Cafe Nomad 欄位 | 對應 Raw Signal              |
| --------------- | ---------------------------- |
| `socket`        | `socket_available`           |
| `quiet`         | `noise_level`（1–5）         |
| `seat`          | `seating_availability`       |
| `wifi`          | `wifi_quality`               |
| `limited_time`  | `time_limit.status`          |
| `open_time`     | `business_hours_raw`（待清洗）|
| `tasty/cheap`   | 不直接映射，供排序輔助       |

### 2.2 Google Places Agent（評論語意萃取）

來源：Google Places API 評論。

**設計重點：評論量大，必須分批處理**。

流程：

1. **取得 reviews**（最多 N 條，依 API 限制）
2. **分批（chunking）**：每批 10–20 條評論
3. **每批執行 LLM 萃取**，輸出結構化 JSON：
   ```json
   {
     "signals": [
       {"type": "socket_available", "polarity": "positive", "evidence": "每桌都有插座", "review_id": "..."},
       {"type": "time_limit", "value": {"status": "limited", "duration_minutes": 90}, "evidence": "客滿限時90分鐘", "review_id": "..."}
     ]
   }
   ```
4. **彙整（Reducer）**：跨批合併同 type 的 signals
5. **信心計算**：套用 `minimum_sources` 規則（如插座需 ≥ 3 位不同評論者）

LLM 提示應引用 SPEC.md 的 `positive_keywords` / `negative_keywords` 作為 grounding。

### 2.3 Instagram Agent（文本 + 圖片）

來源：美食帳號貼文（手動匯入 / 第三方工具）。

任務：

- 文本：與 Google Places Agent 類似的關鍵字 + LLM 萃取
- 圖片：可選用 Vision 模型判斷「桌面大小」「人潮密度」「是否多人用電腦」

### 2.4 Community Edit Agent

來源：登入使用者的直接編輯。

任務：

- 寫入時即視為**最高優先級**（直接覆蓋 AI 判斷，但保留歷史）
- 紀錄 `edited_by` / `edited_at`
- 標記為 evidence type = `community`，confidence = 1.0

## 3. Semantic Agent（共用語意推導）

輸入：來自所有來源的 Raw Signals。

輸出：SPEC.md 中定義的 Product Tags（`socket_available`、`study_friendly`、`discussion_friendly`、`time_limit`⋯⋯）。

規則：

1. **Boolean 標籤**（如 `socket_available`）：套用 `minimum_sources` + `minimum_confidence`
2. **Score 標籤**（如 `study_friendly`）：
   - 套用 `semantic_conditions.strong_positive / weak_positive / negative`
   - 加總、上下限 clip 到 0–100
3. **Structured 標籤**（如 `time_limit`）：
   - LLM 從多筆 evidence 中歸納 canonical 結構
   - 衝突時優先順序：community > recent google > instagram > cafe_nomad

## 4. 處理流程設計考量

### 4.1 分批與成本

- Google 評論：每店 chunk ≤ 20 條，避免單次 prompt 過長
- 使用 cheaper model（Haiku）做初篩，Sonnet/Opus 做最終彙整
- 啟用 prompt caching：system prompt（含 SPEC YAML 摘要）固定不變

### 4.2 失敗與重試

- LLM JSON 輸出需經 schema validator；失敗則 retry，最多 2 次
- 不通過則寫入 `dead_letter` 表供人工處理

### 4.3 更新頻率（freshness）

| 來源           | 建議頻率          |
| -------------- | ----------------- |
| Cafe Nomad     | 每週              |
| Google Places  | 每 2–4 週         |
| Instagram      | 依貼文觸發        |
| Community Edit | 即時              |

每筆標籤都需更新 `last_verified_at`。

## 5. Evidence 與可追溯性

所有寫入 Semantic Layer 的標籤，**必須附帶至少一筆 evidence**：

```json
{
  "tag": "study_friendly",
  "score": 82,
  "confidence": 0.86,
  "evidence": [
    {"source": "google_review", "review_id": "...", "text": "很多人在用電腦，桌子大", "confidence": 0.9},
    {"source": "cafe_nomad", "field": "quiet", "value": 5}
  ],
  "last_verified_at": "2026-05-18"
}
```

無 evidence 的 AI 標籤一律不上線。

## 6. 與其他文件的關係

- 標籤定義 / Schema：見 [SPEC.md](./SPEC.md)
- 產品需求 / UX：見 [requirements.md](./requirements.md)
- 開發任務排序：見 [tasks.md](./tasks.md)
