-- Coffee Pocket — Keyword search on cafe name / address
--
-- 在既有的 cafes_search / cafes_search_count 上新增 p_q text 參數：
--   * p_q 非空時，過濾 name ILIKE '%q%' OR address ILIKE '%q%'
--   * 使用 pg_trgm 的 GIN 索引加速（中文亦適用，trigram 以 byte 切分）
--
-- 直接用 ILIKE 而非 to_tsvector — 因為中文沒有 native FTS parser（Supabase
-- 未提供 zhparser），trigram + ILIKE 對「店名包含」這種需求最直接、結果可預期。

create extension if not exists pg_trgm;

create index if not exists cafes_name_trgm_idx
  on cafes using gin (name gin_trgm_ops);

create index if not exists cafes_address_trgm_idx
  on cafes using gin (address gin_trgm_ops);

drop function if exists cafes_search(text[], float8, float8, int, text, int, int, timestamptz, text[]);
drop function if exists cafes_search_count(text[], float8, float8, int, timestamptz, text[]);

create or replace function cafes_search(
  p_tags     text[],
  p_lng      float8,
  p_lat      float8,
  p_radius_m int,
  p_sort     text,
  p_limit    int,
  p_offset   int,
  p_open_at  timestamptz default null,
  p_tags_or  text[] default null,
  p_q        text default null
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
    select case
      when p_q is null then null
      when length(btrim(p_q)) = 0 then null
      else btrim(p_q)
    end as q
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
        (select q from q_norm) is null
        or c.name ilike '%' || (select q from q_norm) || '%'
        or c.address ilike '%' || (select q from q_norm) || '%'
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
    -- 關鍵字搜尋時，店名命中優先於地址命中，店名命中內以 trigram 相似度排序
    case when (select q from q_norm) is not null and w.name ilike '%' || (select q from q_norm) || '%' then 0 else 1 end asc,
    case when (select q from q_norm) is not null then similarity(w.name, (select q from q_norm)) end desc nulls last,
    case when coalesce(p_sort, 'distance') = 'distance' then w.dist_m end asc nulls last,
    case when p_sort = 'rating' then w.google_rating end desc nulls last,
    case when p_sort = 'popular' then w.google_rating end desc nulls last,
    w.name asc
  limit coalesce(p_limit, 20)
  offset coalesce(p_offset, 0);
$$;

create or replace function cafes_search_count(
  p_tags     text[],
  p_lng      float8,
  p_lat      float8,
  p_radius_m int,
  p_open_at  timestamptz default null,
  p_tags_or  text[] default null,
  p_q        text default null
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
    select case
      when p_q is null then null
      when length(btrim(p_q)) = 0 then null
      else btrim(p_q)
    end as q
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
      (select q from q_norm) is null
      or c.name ilike '%' || (select q from q_norm) || '%'
      or c.address ilike '%' || (select q from q_norm) || '%'
    );
$$;

grant execute on function cafes_search(text[], float8, float8, int, text, int, int, timestamptz, text[], text) to anon, authenticated;
grant execute on function cafes_search_count(text[], float8, float8, int, timestamptz, text[], text) to anon, authenticated;
