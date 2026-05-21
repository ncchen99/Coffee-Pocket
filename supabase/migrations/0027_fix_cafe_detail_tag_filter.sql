-- Coffee Pocket — Fix cafe_detail tag filtering
--
-- Bug: cafe_detail RPC 的 all_tags_cte 只顯示有 evidence 或 votes 的標籤。
-- 這導致 pipeline 匯入的標籤（存在於 cafe_tags，confidence > 0，但無 evidence/votes）
-- 不會在詳細頁顯示，但搜尋結果和標籤篩選仍然使用它們 → 不一致。
--
-- Fix: 如果標籤在 cafe_tags 中有實際記錄 (ct.id IS NOT NULL)，不論有無 evidence/votes
-- 都應顯示。WHERE 只篩掉「僅靠 tag_votes 存在但 net 無正面支持」的幽靈標籤。

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
        else ct.confidence
      end as calc_confidence
    from (
      select tag_key from cafe_tags where cafe_id = p_cafe_id
      union
      select tag_key from tag_votes where cafe_id = p_cafe_id
    ) all_tags
    left join cafe_tags ct on ct.cafe_id = p_cafe_id and ct.tag_key = all_tags.tag_key
    where
      -- 保留：在 cafe_tags 中有記錄的標籤（pipeline 匯入或社群新增）
      ct.id is not null
      -- 保留：雖不在 cafe_tags,但有 evidence 或 votes 支持
      or (
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
