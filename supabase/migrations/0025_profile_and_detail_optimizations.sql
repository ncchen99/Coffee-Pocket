-- Coffee Pocket — Profile / detail / pockets RPC consolidation.
--
-- 5. user_stats:1 個 RPC 回 4 個 count(原本 4 個 head:true 並行查詢)
-- 5. user_contributions:UNION ALL 一次取 edits + votes 並全域排序截斷
-- 7. cafe_detail / cafe_detail_by_slug:加 top_tag_keys text[]
-- 8. user_pockets:單一 RPC 拿 pockets + item_count(取代 PostgREST embed count)

-- ---------------------------------------------------------------------------
-- 5a. user_stats —— 4 個 count 合成一行
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER 因為 tag_votes 0016 改成 self-only select、edits 也有 RLS。
-- 我們不回傳任何 PII,只回傳「目前登入者自己的」彙總值,並且強制 p_user_id =
-- auth.uid(),不允許查別人。
create or replace function user_stats(p_user_id uuid)
returns table (
  pocket_count       bigint,
  pocket_items_count bigint,
  edits_count        bigint,
  votes_count        bigint
)
language plpgsql
stable
security definer
as $$
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::bigint from pockets       where user_id = p_user_id),
    (select count(*)::bigint from pocket_items pi
       join pockets p on p.id = pi.pocket_id
       where p.user_id = p_user_id),
    (select count(*)::bigint from edits        where user_id = p_user_id),
    (select count(*)::bigint from tag_votes    where user_id = p_user_id);
end;
$$;

grant execute on function user_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5b. user_contributions —— UNION ALL,全域排序截斷
-- ---------------------------------------------------------------------------
create or replace function user_contributions(p_user_id uuid, p_limit int default 20)
returns table (
  kind        text,          -- 'edit' | 'vote'
  ref_id      text,           -- 用於前端 React key:edit 的 uuid 或 vote 的 cafe+tag
  cafe_id     uuid,
  cafe_name   text,
  target      text,           -- edit.target / vote.tag_key
  after_value jsonb,          -- edit.after_value(vote 為 null)
  vote        int,             -- vote.vote(edit 為 null)
  status      text,           -- edit.status(vote 為 null)
  created_at  timestamptz
)
language plpgsql
stable
security definer
as $$
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with merged as (
    select
      'edit'::text                       as kind,
      e.id::text                         as ref_id,
      e.cafe_id,
      c.name                             as cafe_name,
      e.target                           as target,
      e.after_value                      as after_value,
      null::int                          as vote,
      e.status::text                     as status,
      e.created_at                       as created_at
    from edits e
    left join cafes c on c.id = e.cafe_id
    where e.user_id = p_user_id

    union all

    select
      'vote'::text                       as kind,
      (tv.cafe_id::text || '-' || tv.tag_key || '-' || tv.created_at::text) as ref_id,
      tv.cafe_id,
      c.name                             as cafe_name,
      tv.tag_key                         as target,
      null::jsonb                        as after_value,
      tv.vote                            as vote,
      null::text                         as status,
      tv.created_at                      as created_at
    from tag_votes tv
    left join cafes c on c.id = tv.cafe_id
    where tv.user_id = p_user_id
  )
  select *
  from merged
  order by created_at desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function user_contributions(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. cafe_detail / cafe_detail_by_slug:加 top_tag_keys
-- ---------------------------------------------------------------------------
-- 直接從 0022 的 tags 結構再 derive 一個 top_tag_keys(confidence 前 3)。
-- 整段邏輯沿用 0022,只在 jsonb_build_object 多塞一個鍵。
create or replace function cafe_detail(p_cafe_id uuid)
returns jsonb
language sql
stable
as $$
  with all_tags_cte as (
    select
      all_tags.tag_key,
      ct.tag_type,
      ct.bool_value,
      ct.score_value,
      ct.structured_value,
      coalesce((select count(*) from tag_votes tv where tv.cafe_id = p_cafe_id and tv.tag_key = all_tags.tag_key and tv.vote = 1), 0) as vote_up,
      coalesce((select count(*) from tag_votes tv where tv.cafe_id = p_cafe_id and tv.tag_key = all_tags.tag_key and tv.vote = -1), 0) as vote_down,
      (
        coalesce((select count(*) from tag_evidence te where te.cafe_tag_id = ct.id), 0) +
        coalesce((select count(*) from tag_votes tv where tv.cafe_id = p_cafe_id and tv.tag_key = all_tags.tag_key and tv.vote = 1), 0)
      ) as calc_evidence_count,
      case
        when (
          coalesce((select count(*) from tag_evidence te where te.cafe_tag_id = ct.id), 0) +
          coalesce((select count(*) from tag_votes tv where tv.cafe_id = p_cafe_id and tv.tag_key = all_tags.tag_key and tv.vote = 1), 0) +
          coalesce((select count(*) from tag_votes tv where tv.cafe_id = p_cafe_id and tv.tag_key = all_tags.tag_key and tv.vote = -1), 0)
        ) > 0
        then (
          (
            coalesce((select count(*) from tag_evidence te where te.cafe_tag_id = ct.id), 0) +
            coalesce((select count(*) from tag_votes tv where tv.cafe_id = p_cafe_id and tv.tag_key = all_tags.tag_key and tv.vote = 1), 0)
          )::numeric /
          (
            coalesce((select count(*) from tag_evidence te where te.cafe_tag_id = ct.id), 0) +
            coalesce((select count(*) from tag_votes tv where tv.cafe_id = p_cafe_id and tv.tag_key = all_tags.tag_key and tv.vote = 1), 0) +
            coalesce((select count(*) from tag_votes tv where tv.cafe_id = p_cafe_id and tv.tag_key = all_tags.tag_key and tv.vote = -1), 0)
          )
        )
        else 1.0
      end as calc_confidence
    from (
      select tag_key from cafe_tags where cafe_id = p_cafe_id
      union
      select tag_key from tag_votes where cafe_id = p_cafe_id
    ) all_tags
    left join cafe_tags ct on ct.cafe_id = p_cafe_id and ct.tag_key = all_tags.tag_key
    where (
      coalesce((select count(*) from tag_evidence te where te.cafe_tag_id = ct.id), 0) +
      coalesce((select count(*) from tag_votes tv where tv.cafe_id = p_cafe_id and tv.tag_key = all_tags.tag_key and tv.vote = 1), 0) +
      coalesce((select count(*) from tag_votes tv where tv.cafe_id = p_cafe_id and tv.tag_key = all_tags.tag_key and tv.vote = -1), 0)
    ) > 0
  )
  select case when c.id is null then null else
    jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name,
      'address', c.address,
      'phone', c.phone,
      'instagram_url', c.instagram_url,
      'google_maps_url', c.google_maps_url,
      'google_place_id', c.google_place_id,
      'cafe_nomad_id', c.cafe_nomad_id,
      'lng', ST_X(c.location::geometry),
      'lat', ST_Y(c.location::geometry),
      'business_hours', c.business_hours,
      'photos', c.photos,
      'summary_ai', c.summary_ai,
      'business_status', c.business_status,
      'google_rating', c.google_rating,
      'google_review_count', c.google_review_count,
      'price_level', c.price_level,
      'cover_image_url', c.cover_image_url,
      'duplicate_of', c.duplicate_of,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'open_now', cafe_open_at(c.business_hours),
      'tags', coalesce((
        select jsonb_agg(jsonb_build_object(
          'key', t.tag_key,
          'type', coalesce(t.tag_type, 'boolean'),
          'bool_value', coalesce(t.bool_value, true),
          'score_value', t.score_value,
          'structured_value', t.structured_value,
          'confidence', t.calc_confidence,
          'evidence_count', t.calc_evidence_count,
          'vote_up', t.vote_up,
          'vote_down', t.vote_down
        ) order by t.calc_confidence desc)
        from all_tags_cte t
      ), '[]'::jsonb),
      'top_tag_keys', coalesce((
        select array_agg(t.tag_key order by t.calc_confidence desc)
        from (
          select tag_key, calc_confidence
          from all_tags_cte
          order by calc_confidence desc
          limit 3
        ) t
      ), '{}'::text[])
    )
  end
  from cafes c
  where c.id = p_cafe_id;
$$;

grant execute on function cafe_detail(uuid) to anon, authenticated;

-- cafe_detail_by_slug 是純薄包裝,不需要改實作 —— 它 call cafe_detail,
-- 自然吃到新的 top_tag_keys。

-- ---------------------------------------------------------------------------
-- 8. user_pockets:單一 RPC 回傳 pockets + item_count
-- ---------------------------------------------------------------------------
-- PostgREST 的 select=*,pocket_items(count) 每個 pocket 各開一個子查詢、
-- 包裝成巢狀陣列再回來,口袋多時很笨。用 SQL 一次 group by 算完。
create or replace function user_pockets()
returns table (
  id          uuid,
  user_id     uuid,
  name        text,
  emoji       text,
  sort_order  int,
  is_public   boolean,
  created_at  timestamptz,
  item_count  bigint
)
language sql
stable
security invoker
as $$
  select
    p.id, p.user_id, p.name, p.emoji, p.sort_order, p.is_public, p.created_at,
    coalesce(pi.cnt, 0)::bigint as item_count
  from pockets p
  left join (
    select pocket_id, count(*) as cnt
    from pocket_items
    group by pocket_id
  ) pi on pi.pocket_id = p.id
  order by p.sort_order asc, p.created_at asc;
$$;

grant execute on function user_pockets() to authenticated;
