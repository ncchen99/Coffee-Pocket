-- Coffee Pocket — 全量資料 RPC for client-side search
--
-- 動機
-- ----
-- 臺南地區的咖啡廳常駐量只有 ~200 筆。每次調整 tag/sort/keyword 都打一次
-- cafes_search RPC，等於把「拼音比對 + tag 篩選 + 距離計算」這些可在前端 10ms
-- 內完成的工作丟給後端。改成「冷啟動下載一次全量 → 前端本地索引」後：
--   * 字串/拼音搜尋可以做到逐字即時更新（不打網路）
--   * tag chip 切換、距離排序、open_at 篩選都零延遲
--   * 後端 cafes_search 仍保留給 SEO / 分享連結 / Edge Function 內部用
--
-- 回傳 ALL 有效咖啡廳（去掉 duplicate 與永久/暫時歇業）的搜尋必要欄位。
-- 不做任何過濾，前端拿到後自己 filter。
create or replace function cafes_all_for_search()
returns table (
  id              uuid,
  slug            text,
  name            text,
  name_pinyin     text,
  address         text,
  cover_image_url text,
  lng             float8,
  lat             float8,
  google_rating   numeric,
  business_hours  jsonb,
  -- 排序前 3 名（與 cafes_search 一致）
  top_tags        text[],
  -- 全部「有效」tag_keys（boolean=true / score>=50 / time_limit=unlimited），
  -- 給前端做 AND/OR 篩選比對。
  tag_keys        text[]
)
language sql
stable
as $$
  with active_tags as (
    select
      ct.cafe_id,
      ct.tag_key,
      ct.confidence
    from cafe_tags ct
    where (ct.tag_type = 'boolean' and ct.bool_value = true)
       or (ct.tag_type = 'score' and ct.score_value >= 50)
       or (ct.tag_type = 'structured'
           and ct.tag_key = 'time_limit'
           and ct.structured_value->>'status' = 'unlimited')
  ),
  agg as (
    select
      cafe_id,
      array_agg(tag_key order by confidence desc) as all_keys,
      (array_agg(tag_key order by confidence desc))[1:3] as top3
    from active_tags
    group by cafe_id
  )
  select
    c.id,
    c.slug,
    c.name,
    c.name_pinyin,
    c.address,
    c.cover_image_url,
    ST_X(c.location::geometry) as lng,
    ST_Y(c.location::geometry) as lat,
    c.google_rating,
    c.business_hours,
    coalesce(a.top3, array[]::text[]) as top_tags,
    coalesce(a.all_keys, array[]::text[]) as tag_keys
  from cafes c
  left join agg a on a.cafe_id = c.id
  where c.duplicate_of is null
    and (c.business_status is null
         or c.business_status not in ('permanently_closed', 'temporarily_closed'));
$$;

grant execute on function cafes_all_for_search() to anon, authenticated;
