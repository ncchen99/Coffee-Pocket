-- Expose google_review_count and price_level via cafe_detail RPC.
create or replace function cafe_detail(p_cafe_id uuid)
returns jsonb
language sql
stable
as $$
  select case when c.id is null then null else
    jsonb_build_object(
      'id', c.id,
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
          'key', ct.tag_key,
          'type', ct.tag_type,
          'bool_value', ct.bool_value,
          'score_value', ct.score_value,
          'structured_value', ct.structured_value,
          'confidence', ct.confidence,
          'evidence_count', (select count(*) from tag_evidence te where te.cafe_tag_id = ct.id),
          'vote_up', (select count(*) from tag_votes tv where tv.cafe_id = c.id and tv.tag_key = ct.tag_key and tv.vote = 1),
          'vote_down', (select count(*) from tag_votes tv where tv.cafe_id = c.id and tv.tag_key = ct.tag_key and tv.vote = -1)
        ) order by ct.confidence desc)
        from cafe_tags ct where ct.cafe_id = c.id
      ), '[]'::jsonb)
    )
  end
  from cafes c
  where c.id = p_cafe_id;
$$;

grant execute on function cafe_detail(uuid) to anon, authenticated;
