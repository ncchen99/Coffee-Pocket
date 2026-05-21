-- Coffee Pocket — Add Hanyu Pinyin column + URL slug for cafes, support phonetic search
--
-- 動機：
--   * 「黑浮」vs「黑福」中文 trigram 無法匹配；轉成拼音 (heifu) 後就能用 pg_trgm 處理
--   * slug 之後用於 SEO-friendly URL (/cafe/heifu-coffee 代替 UUID)
--
-- 注意：
--   * name_pinyin / slug 由 Python pipeline（pypinyin）生成 — Postgres 無原生拼音函式
--   * 本 migration 只負責 schema + RPC，欄位內容靠 generate_pinyin.py 回填
--   * p_q_pinyin 由前端用 pinyin-pro 把使用者輸入轉換後一起送進 RPC

alter table cafes
  add column if not exists name_pinyin text,
  add column if not exists slug text;

create unique index if not exists cafes_slug_uniq_idx on cafes (slug) where slug is not null;
create index if not exists cafes_name_pinyin_trgm_idx on cafes using gin (name_pinyin gin_trgm_ops);

drop function if exists cafes_search(text[], float8, float8, int, text, int, int, timestamptz, text[], text);
drop function if exists cafes_search_count(text[], float8, float8, int, timestamptz, text[], text);

create or replace function cafes_search(
  p_tags      text[],
  p_lng       float8,
  p_lat       float8,
  p_radius_m  int,
  p_sort      text,
  p_limit     int,
  p_offset    int,
  p_open_at   timestamptz default null,
  p_tags_or   text[] default null,
  p_q         text default null,
  p_q_pinyin  text default null
)
returns table (
  id              uuid,
  name            text,
  cover_image_url text,
  top_tags        text[],
  distance_m      float8,
  open_now        boolean,
  closes_at       text,
  lng             float8,
  lat             float8,
  google_rating   numeric,
  total_count     bigint,
  business_hours  jsonb
)
language sql
stable
as $$
  with point as (
    select case when p_lng is not null and p_lat is not null
      then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      else null end as g
  ),
  q_norm as (
    select
      case when p_q is null or length(btrim(p_q)) = 0 then null else btrim(p_q) end as q,
      case when p_q_pinyin is null or length(btrim(p_q_pinyin)) = 0 then null else lower(btrim(p_q_pinyin)) end as qp
  ),
  base as (
    select c.*,
      case when (select g from point) is not null
        then ST_Distance(c.location, (select g from point))
        else null end as dist_m
    from cafes c
    where c.duplicate_of is null
      and (c.business_status is null or c.business_status not in ('permanently_closed', 'temporarily_closed'))
      and (
        (select g from point) is null
        or p_radius_m is null
        or ST_DWithin(c.location, (select g from point), p_radius_m)
      )
      and (
        p_tags is null or array_length(p_tags, 1) is null
        or (
          select count(*) from unnest(p_tags) as t(tag_key)
          where exists (
            select 1 from cafe_tags ct
            where ct.cafe_id = c.id
              and ct.tag_key = t.tag_key
              and (
                (ct.tag_type = 'boolean' and ct.bool_value = true)
                or (ct.tag_type = 'score' and ct.score_value >= 50)
                or (ct.tag_type = 'structured' and ct.tag_key = 'time_limit'
                    and ct.structured_value->>'status' = 'unlimited')
              )
          )
        ) = array_length(p_tags, 1)
      )
      and (
        p_tags_or is null or array_length(p_tags_or, 1) is null
        or exists (
          select 1 from cafe_tags ct
          where ct.cafe_id = c.id
            and ct.tag_key = any(p_tags_or)
            and (
              (ct.tag_type = 'boolean' and ct.bool_value = true)
              or (ct.tag_type = 'score' and ct.score_value >= 50)
              or (ct.tag_type = 'structured' and ct.tag_key = 'time_limit'
                  and ct.structured_value->>'status' = 'unlimited')
            )
        )
      )
      and (
        p_open_at is null
        or cafe_open_at(c.business_hours, p_open_at) = true
      )
      and (
        -- 任一條件命中即可：原字 / 地址 / 拼音
        ((select q from q_norm) is null and (select qp from q_norm) is null)
        or ((select q from q_norm) is not null and c.name ilike '%' || (select q from q_norm) || '%')
        or ((select q from q_norm) is not null and c.address ilike '%' || (select q from q_norm) || '%')
        or ((select qp from q_norm) is not null and c.name_pinyin ilike '%' || (select qp from q_norm) || '%')
      )
  ),
  with_top as (
    select b.*,
      (
        select array_agg(ct.tag_key order by ct.confidence desc)
        from (
          select tag_key, confidence
          from cafe_tags ct2
          where ct2.cafe_id = b.id
            and (
              (ct2.tag_type = 'boolean' and ct2.bool_value = true)
              or (ct2.tag_type = 'score' and ct2.score_value >= 50)
              or (ct2.tag_type = 'structured' and ct2.tag_key = 'time_limit'
                  and ct2.structured_value->>'status' = 'unlimited')
            )
          order by ct2.confidence desc
          limit 3
        ) ct
      ) as t_tags
    from base b
  )
  select
    w.id,
    w.name,
    w.cover_image_url,
    coalesce(w.t_tags, array[]::text[]) as top_tags,
    w.dist_m as distance_m,
    case when p_open_at is not null then cafe_open_at(w.business_hours, p_open_at)
         else cafe_open_at(w.business_hours) end as open_now,
    null::text as closes_at,
    ST_X(w.location::geometry) as lng,
    ST_Y(w.location::geometry) as lat,
    w.google_rating,
    count(*) over() as total_count,
    w.business_hours
  from with_top w
  order by
    -- 原字店名命中 → 拼音店名命中 → 地址命中 → 其餘
    case
      when (select q from q_norm) is not null and w.name ilike '%' || (select q from q_norm) || '%' then 0
      when (select qp from q_norm) is not null and w.name_pinyin ilike '%' || (select qp from q_norm) || '%' then 1
      when (select q from q_norm) is not null and w.address ilike '%' || (select q from q_norm) || '%' then 2
      else 3
    end asc,
    case when (select q from q_norm) is not null then similarity(w.name, (select q from q_norm)) end desc nulls last,
    case when coalesce(p_sort, 'distance') = 'distance' then w.dist_m end asc nulls last,
    case when p_sort = 'rating' then w.google_rating end desc nulls last,
    case when p_sort = 'popular' then w.google_rating end desc nulls last,
    w.name asc
  limit coalesce(p_limit, 20)
  offset coalesce(p_offset, 0);
$$;

create or replace function cafes_search_count(
  p_tags      text[],
  p_lng       float8,
  p_lat       float8,
  p_radius_m  int,
  p_open_at   timestamptz default null,
  p_tags_or   text[] default null,
  p_q         text default null,
  p_q_pinyin  text default null
)
returns bigint
language sql
stable
as $$
  with point as (
    select case when p_lng is not null and p_lat is not null
      then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      else null end as g
  ),
  q_norm as (
    select
      case when p_q is null or length(btrim(p_q)) = 0 then null else btrim(p_q) end as q,
      case when p_q_pinyin is null or length(btrim(p_q_pinyin)) = 0 then null else lower(btrim(p_q_pinyin)) end as qp
  )
  select count(*)::bigint
  from cafes c
  where c.duplicate_of is null
    and (c.business_status is null or c.business_status not in ('permanently_closed', 'temporarily_closed'))
    and (
      (select g from point) is null
      or p_radius_m is null
      or ST_DWithin(c.location, (select g from point), p_radius_m)
    )
    and (
      p_tags is null or array_length(p_tags, 1) is null
      or (
        select count(*) from unnest(p_tags) as t(tag_key)
        where exists (
          select 1 from cafe_tags ct
          where ct.cafe_id = c.id
            and ct.tag_key = t.tag_key
            and (
              (ct.tag_type = 'boolean' and ct.bool_value = true)
              or (ct.tag_type = 'score' and ct.score_value >= 50)
              or (ct.tag_type = 'structured' and ct.tag_key = 'time_limit'
                  and ct.structured_value->>'status' = 'unlimited')
            )
        )
      ) = array_length(p_tags, 1)
    )
    and (
      p_tags_or is null or array_length(p_tags_or, 1) is null
      or exists (
        select 1 from cafe_tags ct
        where ct.cafe_id = c.id
          and ct.tag_key = any(p_tags_or)
          and (
            (ct.tag_type = 'boolean' and ct.bool_value = true)
            or (ct.tag_type = 'score' and ct.score_value >= 50)
            or (ct.tag_type = 'structured' and ct.tag_key = 'time_limit'
                and ct.structured_value->>'status' = 'unlimited')
          )
      )
    )
    and (
      p_open_at is null
      or cafe_open_at(c.business_hours, p_open_at) = true
    )
    and (
      ((select q from q_norm) is null and (select qp from q_norm) is null)
      or ((select q from q_norm) is not null and c.name ilike '%' || (select q from q_norm) || '%')
      or ((select q from q_norm) is not null and c.address ilike '%' || (select q from q_norm) || '%')
      or ((select qp from q_norm) is not null and c.name_pinyin ilike '%' || (select qp from q_norm) || '%')
    );
$$;

grant execute on function cafes_search(text[], float8, float8, int, text, int, int, timestamptz, text[], text, text) to anon, authenticated;
grant execute on function cafes_search_count(text[], float8, float8, int, timestamptz, text[], text, text) to anon, authenticated;
