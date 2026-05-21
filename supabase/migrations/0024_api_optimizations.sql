-- Coffee Pocket — API round-trip optimizations.
--
-- 1. pocket_cafes:回傳 top_tags,前端不再需要二次 batch 抓 cafe_tags
-- 2. add_cafe_tag:把「upsert cafe_tags + upsert tag_votes」合進一個 RPC
-- 3. merge_user_preferences:server-side jsonb merge,省掉「先讀再寫」

-- ---------------------------------------------------------------------------
-- 1. pocket_cafes:把 top_tags 內嵌進來
-- ---------------------------------------------------------------------------
-- 篩選邏輯與前端原本的 .or(...) 一致:
--   boolean=true ∪ score>=50 ∪ structured + tag_key='time_limit'
-- 按 confidence 由高到低取前 3 個 tag_key。
drop function if exists pocket_cafes(uuid);

create or replace function pocket_cafes(p_pocket_id uuid)
returns table (
  id              uuid,
  pocket_id       uuid,
  cafe_id         uuid,
  personal_note   text,
  added_at        timestamptz,
  cafe_slug       text,
  cafe_name       text,
  cafe_address    text,
  cover_image_url text,
  google_rating   numeric,
  google_review_count int,
  price_level     text,
  business_hours  jsonb,
  lng             double precision,
  lat             double precision,
  top_tags        text[]
)
language sql
stable
as $$
  select
    pi.id,
    pi.pocket_id,
    pi.cafe_id,
    pi.personal_note,
    pi.added_at,
    c.slug,
    c.name,
    c.address,
    c.cover_image_url,
    c.google_rating,
    c.google_review_count,
    c.price_level,
    c.business_hours,
    ST_X(c.location::geometry) as lng,
    ST_Y(c.location::geometry) as lat,
    coalesce(tt.top_tags, '{}'::text[]) as top_tags
  from pocket_items pi
  join cafes c on c.id = pi.cafe_id
  left join lateral (
    select array_agg(tag_key order by confidence desc) as top_tags
    from (
      select ct.tag_key, ct.confidence
      from cafe_tags ct
      where ct.cafe_id = pi.cafe_id
        and (
          (ct.tag_type = 'boolean'    and ct.bool_value = true)
          or (ct.tag_type = 'score'   and ct.score_value >= 50)
          or (ct.tag_type = 'structured' and ct.tag_key = 'time_limit')
        )
      order by ct.confidence desc nulls last
      limit 3
    ) s
  ) tt on true
  where pi.pocket_id = p_pocket_id
  order by pi.added_at desc;
$$;

grant execute on function pocket_cafes(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. add_cafe_tag:單一 RPC 同時做 cafe_tags upsert + tag_votes upsert
-- ---------------------------------------------------------------------------
-- 安全性:
--   SECURITY INVOKER —— 走呼叫者身分 + RLS。
--   cafe_tags 的 community insert/update policy(0018)允許 authenticated 寫,
--   tag_votes 的 self insert/update policy(0005/0016)允許 user_id = auth.uid()。
--   未登入 → auth.uid() 為 null,policy 會擋下整個操作。
create or replace function add_cafe_tag(
  p_cafe_id uuid,
  p_tag_key text
)
returns void
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into cafe_tags (
    cafe_id, tag_key, tag_type, bool_value,
    confidence, locked_by_community, last_verified_at
  )
  values (
    p_cafe_id, p_tag_key, 'boolean', true,
    1.0, true, current_date
  )
  on conflict (cafe_id, tag_key) do update
    set tag_type            = excluded.tag_type,
        bool_value          = excluded.bool_value,
        confidence          = excluded.confidence,
        locked_by_community = excluded.locked_by_community,
        last_verified_at    = excluded.last_verified_at;

  insert into tag_votes (cafe_id, tag_key, user_id, vote)
  values (p_cafe_id, p_tag_key, v_user_id, 1)
  on conflict (cafe_id, tag_key, user_id) do update
    set vote = excluded.vote;
end;
$$;

grant execute on function add_cafe_tag(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. merge_user_preferences:server-side jsonb merge
-- ---------------------------------------------------------------------------
-- 用 `||` 做淺層合併,語義跟前端原本的 `{ ...current, ...prefs }` 一致。
-- SECURITY INVOKER + users 表已有「self write」UPDATE policy(0001)。
create or replace function merge_user_preferences(p_patch jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_result  jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update users
     set preferences = coalesce(preferences, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
   where id = v_user_id
   returning preferences into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

grant execute on function merge_user_preferences(jsonb) to authenticated;
