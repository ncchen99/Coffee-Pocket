下面是保守的逐步指令。重點原則：
- **`google_scraper`** 只寫本地 JSON 到 `data/reviews/`，不碰 DB → 安全先跑。
- **`google_extract` / `semantic` / `ai_summary`** 都會直接寫 DB（沒有 `--dry-run` 旗標），所以「查看不寫」這一步是用 **`--no-llm`** 或**先看本地 JSON / 用 SQL 看現況**達成；「一兩筆寫入」則用 `--file` / `--cafe-id` / `--limit 1` 限制範圍。

請替換 `<CAFE_ID>` 與 `<PLACE_ID>`（同一家咖啡廳）。

---

### Stage 0 — 不寫 DB：先抓 1 家的評論到本地 JSON

```bash
# 開瀏覽器看，方便確認排序是 "最相關"、抓滿 ~200 筆
uv run python -m coffee_pocket.agents.enrich.google_scraper \
  --cafe-id <CAFE_ID> --sort relevance --max-reviews 200 --headful
```

檢查產物（不寫 DB）：

```bash
ls -lh data/reviews/<PLACE_ID>.json
uv run python -c "import json,sys; d=json.load(open('data/reviews/<PLACE_ID>.json')); print('reviews:', len(d.get('reviews', []))); print('sample:', d['reviews'][0])"
```

---

### Stage 1 — 不寫 DB：只看 reviews_raw 會 upsert 哪些列（不跑 LLM）

```bash
# --no-llm = 只把本地 JSON upsert 進 reviews_raw，不呼叫 LLM、不寫 extracted_signals
uv run python -m coffee_pocket.agents.process.google_extract \
  --file data/reviews/<PLACE_ID>.json --no-llm
```

> ⚠️ 這仍會 upsert `reviews_raw`（評論原文表）。若想完全不動 DB，跳過此步，直接看本地 JSON 即可。

---

### Stage 2 — 寫入 1 家：跑 LLM 抽 signals

```bash
uv run python -m coffee_pocket.agents.process.google_extract \
  --file data/reviews/<PLACE_ID>.json --reprocess
```

到 Supabase SQL Editor 看抽出的訊號是否合理：

```sql
select external_id, extracted_signals
from reviews_raw
where cafe_id = '<CAFE_ID>' and source_id = 'google_places'
  and extracted_signals is not null
order by processed_at desc
limit 10;
```

重點看：`socket_most/few`、`large_table_most/few`、`wifi_available`、`high_cp_value`、`scooter/car_parking_easy`、`has_resident_cat/dog`、`group_chat_friendly`、`time_limit.status`。

---

### Stage 3 — 寫入 1 家：聚合到 cafe_tags

```bash
uv run python -m coffee_pocket.agents.process.semantic --cafe-id <CAFE_ID>
```

```sql
select tag_key, bool_value, score_value, value, confidence, evidence_count, source_breakdown
from cafe_tags where cafe_id = '<CAFE_ID>'
order by tag_key;
```

確認門檻有生效（單筆證據的標籤應該不見、互斥的 `*_most` / `*_few` 不會同時出現）。

---

### Stage 4 — 寫入 1 家：AI 摘要 map-reduce

```bash
uv run python -m coffee_pocket.agents.process.ai_summary --cafe-id <CAFE_ID> --force
```

```sql
select ai_summary, ai_summary_updated_at from cafes where id = '<CAFE_ID>';
```

---

### Stage 5 — 確認 OK 後擴大到 2 家

```bash
# 換成另一家先看 JSON
uv run python -m coffee_pocket.agents.enrich.google_scraper \
  --cafe-id <CAFE_ID_2> --sort relevance --max-reviews 200

# 寫入
uv run python -m coffee_pocket.agents.process.google_extract --limit 2 --reprocess
uv run python -m coffee_pocket.agents.process.semantic --limit 2
uv run python -m coffee_pocket.agents.process.ai_summary --limit 2
```

---

### 出問題時的回滾小抄

```sql
-- 清掉某家的 tag 結果，重跑 semantic
delete from tag_evidence where cafe_tag_id in (select id from cafe_tags where cafe_id='<CAFE_ID>');
delete from cafe_tags where cafe_id='<CAFE_ID>';

-- 強制重抽 LLM signals
update reviews_raw set extracted_signals=null, processed_at=null
where cafe_id='<CAFE_ID>' and source_id='google_places';
```

建議從 Stage 0–4 一家跑完、看過 SQL 結果都合理，再進 Stage 5。