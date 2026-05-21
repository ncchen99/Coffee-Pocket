-- Coffee Pocket — Normalized fuzzy search + slug-based detail RPC
--
-- 動機
-- ----
-- 0019/0020 的 ILIKE '%q%' 對標點 / 空白 / 連字號很敏感：
--   * 「為你煮」搜不到「For you espresso 為你·煮咖啡」（中間有 ·）
--   * 「foryou」搜不到「For You Espresso.」（有空白 / 句點）
-- 解法：搜尋前把店名 / 地址 / 拼音 / 查詢字串都先 normalize（去掉空白和標點，
-- 全部小寫）。並對 normalize 後的形式建 GIN trigram index，可同時支援
--   * 子字串命中（ILIKE）
--   * 相似度命中（pg_trgm `%` operator）— 處理錯字、缺字
-- 再加上原本的 name_pinyin 同音字搜尋，三層 fallback。
--
-- 順便加 cafe_detail_by_slug RPC — 前端要從 UUID 路由改成 slug 路由。
-- 為了相容舊書籤 / 連結，slug 找不到時 fallback 到 UUID 解析。

-- ---------------------------------------------------------------------------
-- 1. 共用 normalize 函式（IMMUTABLE，可用於 functional index）
-- ---------------------------------------------------------------------------
create or replace function normalize_search_text(t text)
returns text
language sql
immutable
parallel safe
as $$
  -- 全部小寫 + 移除任何空白與標點（保留字母、數字、CJK 與其他 letter codepoint）。
  -- POSIX [:space:] / [:punct:] 在 Postgres 內建 regex 內可用。
  select regexp_replace(lower(coalesce(t, '')), '[[:space:][:punct:]]+', '', 'g');
$$;

-- ---------------------------------------------------------------------------
-- 2. 對 normalize 後的欄位建 functional GIN trigram index
-- ---------------------------------------------------------------------------
create index if not exists cafes_name_norm_trgm_idx
  on cafes using gin (normalize_search_text(name) gin_trgm_ops);

create index if not exists cafes_address_norm_trgm_idx
  on cafes using gin (normalize_search_text(address) gin_trgm_ops);

create index if not exists cafes_name_pinyin_norm_trgm_idx
  on cafes using gin (normalize_search_text(name_pinyin) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. cafes_search — 用 normalize 後比對 + 加入 slug 到回傳結果
-- ---------------------------------------------------------------------------
drop function if exists cafes_search(text[], float8, float8, int, text, int, int, timestamptz, text[], text, text);

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
  slug            text,
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
    -- 同一段 q 同時準備：normalize 後的原字、normalize 後的拼音
    select
      case when p_q is null or length(btrim(p_q)) = 0
        then null else normalize_search_text(p_q) end as q,
      case when p_q_pinyin is null or length(btrim(p_q_pinyin)) = 0
        then null else normalize_search_text(p_q_pinyin) end as qp
  ),
  base as (
    select c.*,
      normalize_search_text(c.name)        as n_norm,
      normalize_search_text(c.address)     as a_norm,
      normalize_search_text(c.name_pinyin) as p_norm,
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
  ),
  filtered as (
    select b.*
    from base b, q_norm
    where (q_norm.q is null and q_norm.qp is null)
       -- 子字串：normalize 後 ILIKE
       or (q_norm.q is not null and (
            b.n_norm like '%' || q_norm.q || '%'
            or b.a_norm like '%' || q_norm.q || '%'
       ))
       or (q_norm.qp is not null and b.p_norm like '%' || q_norm.qp || '%')
       -- 相似度 fallback（pg_trgm `%`，預設 threshold 0.3，dropped chars 也能命中）
       or (q_norm.q is not null and (
            b.n_norm % q_norm.q
            or b.a_norm % q_norm.q
       ))
       or (q_norm.qp is not null and b.p_norm % q_norm.qp)
  ),
  with_top as (
    select f.*,
      -- 計算最佳相似度作為排序依據
      greatest(
        case when (select q from q_norm) is not null
          then similarity(f.n_norm, (select q from q_norm)) else 0 end,
        case when (select qp from q_norm) is not null
          then similarity(f.p_norm, (select qp from q_norm)) else 0 end,
        case when (select q from q_norm) is not null
          then similarity(f.a_norm, (select q from q_norm)) * 0.5 else 0 end
      ) as sim_score,
      -- 命中等級：0 = 原字 substring, 1 = 拼音 substring, 2 = 地址 substring, 3 = 相似度
      case
        when (select q from q_norm) is not null
          and f.n_norm like '%' || (select q from q_norm) || '%' then 0
        when (select qp from q_norm) is not null
          and f.p_norm like '%' || (select qp from q_norm) || '%' then 1
        when (select q from q_norm) is not null
          and f.a_norm like '%' || (select q from q_norm) || '%' then 2
        else 3
      end as hit_rank,
      (
        select array_agg(ct.tag_key order by ct.confidence desc)
        from (
          select tag_key, confidence
          from cafe_tags ct2
          where ct2.cafe_id = f.id
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
    from filtered f
  )
  select
    w.id,
    w.slug,
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
    w.hit_rank asc,
    w.sim_score desc nulls last,
    case when coalesce(p_sort, 'distance') = 'distance' then w.dist_m end asc nulls last,
    case when p_sort = 'rating' then w.google_rating end desc nulls last,
    case when p_sort = 'popular' then w.google_rating end desc nulls last,
    w.name asc
  limit coalesce(p_limit, 20)
  offset coalesce(p_offset, 0);
$$;

grant execute on function cafes_search(text[], float8, float8, int, text, int, int, timestamptz, text[], text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. cafes_search_count — 相同的 normalize + 相似度條件
-- ---------------------------------------------------------------------------
drop function if exists cafes_search_count(text[], float8, float8, int, timestamptz, text[], text, text);

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
      case when p_q is null or length(btrim(p_q)) = 0
        then null else normalize_search_text(p_q) end as q,
      case when p_q_pinyin is null or length(btrim(p_q_pinyin)) = 0
        then null else normalize_search_text(p_q_pinyin) end as qp
  )
  select count(*)::bigint
  from cafes c, q_norm
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
      (q_norm.q is null and q_norm.qp is null)
      or (q_norm.q is not null and (
            normalize_search_text(c.name) like '%' || q_norm.q || '%'
            or normalize_search_text(c.address) like '%' || q_norm.q || '%'
            or normalize_search_text(c.name) % q_norm.q
            or normalize_search_text(c.address) % q_norm.q
      ))
      or (q_norm.qp is not null and (
            normalize_search_text(c.name_pinyin) like '%' || q_norm.qp || '%'
            or normalize_search_text(c.name_pinyin) % q_norm.qp
      ))
    );
$$;

grant execute on function cafes_search_count(text[], float8, float8, int, timestamptz, text[], text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. cafe_detail_by_slug — 包一層讓前端用 slug 取詳細頁
--    若傳進來的字串能解析為 UUID 也接受（向後相容舊書籤）。
-- ---------------------------------------------------------------------------
create or replace function cafe_detail_by_slug(p_slug text)
returns jsonb
language plpgsql
stable
security definer
as $$
declare
  v_id uuid;
begin
  if p_slug is null or length(btrim(p_slug)) = 0 then
    return null;
  end if;

  -- 1. 先試 slug
  select id into v_id from cafes where slug = p_slug limit 1;

  -- 2. fallback：當作 UUID 試解析（舊連結相容）
  if v_id is null then
    begin
      v_id := p_slug::uuid;
    exception when others then
      return null;
    end;
  end if;

  return cafe_detail(v_id);
end;
$$;

grant execute on function cafe_detail_by_slug(text) to anon, authenticated;
