-- Coffee Pocket — RPC functions for search and detail

-- ------------------------------------------------------------------
-- 2.1 cafe_open_at — check if business_hours indicates open at p_at
-- ------------------------------------------------------------------
create or replace function cafe_open_at(p_hours jsonb, p_at timestamptz default now())
returns boolean
language plpgsql
immutable
as $$
declare
  v_local  timestamp;
  v_dow    int;
  v_dow_name text;
  v_slots  jsonb;
  v_slot   jsonb;
  v_open   time;
  v_close  time;
  v_t      time;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'object' then
    return null;
  end if;

  begin
    v_local := (p_at at time zone 'Asia/Taipei')::timestamp;
    v_dow := extract(dow from v_local)::int; -- 0=Sun..6=Sat
    v_t := v_local::time;

    v_dow_name := case v_dow
      when 0 then 'sunday'
      when 1 then 'monday'
      when 2 then 'tuesday'
      when 3 then 'wednesday'
      when 4 then 'thursday'
      when 5 then 'friday'
      when 6 then 'saturday'
    end;

    v_slots := p_hours -> v_dow_name;
    if v_slots is null or jsonb_typeof(v_slots) <> 'array' or jsonb_array_length(v_slots) = 0 then
      return false;
    end if;

    for v_slot in select * from jsonb_array_elements(v_slots) loop
      begin
        v_open := (v_slot->>'open')::time;
        v_close := (v_slot->>'close')::time;
        if v_close > v_open then
          if v_t >= v_open and v_t < v_close then
            return true;
          end if;
        else
          -- overnight (e.g. 18:00-02:00)
          if v_t >= v_open or v_t < v_close then
            return true;
          end if;
        end if;
      exception when others then
        continue;
      end;
    end loop;

    return false;
  exception when others then
    return null;
  end;
end;
$$;

-- ------------------------------------------------------------------
-- 2.2 cafes_search
-- ------------------------------------------------------------------
create or replace function cafes_search(
  p_tags     text[],
  p_lng      float8,
  p_lat      float8,
  p_radius_m int,
  p_sort     text,
  p_limit    int,
  p_offset   int
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
  total_count     bigint
)
language sql
stable
as $$
  with point as (
    select case when p_lng is not null and p_lat is not null
      then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      else null end as g
  ),
  base as (
    select c.*,
      case when (select g from point) is not null
        then ST_Distance(c.location, (select g from point))
        else null end as dist_m
    from cafes c
    where c.duplicate_of is null
      and (c.business_status is null or c.business_status <> 'CLOSED_PERMANENTLY')
      and (
        (select g from point) is null
        or ST_DWithin(c.location, (select g from point), coalesce(p_radius_m, 5000))
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
    cafe_open_at(w.business_hours) as open_now,
    null::text as closes_at,
    ST_X(w.location::geometry) as lng,
    ST_Y(w.location::geometry) as lat,
    w.google_rating,
    count(*) over() as total_count
  from with_top w
  order by
    case when coalesce(p_sort, 'distance') = 'distance' then w.dist_m end asc nulls last,
    case when p_sort = 'rating' then w.google_rating end desc nulls last,
    case when p_sort = 'popular' then w.google_rating end desc nulls last,
    w.name asc
  limit coalesce(p_limit, 20)
  offset coalesce(p_offset, 0);
$$;

-- ------------------------------------------------------------------
-- 2.3 cafes_search_count
-- ------------------------------------------------------------------
create or replace function cafes_search_count(
  p_tags     text[],
  p_lng      float8,
  p_lat      float8,
  p_radius_m int
)
returns bigint
language sql
stable
as $$
  with point as (
    select case when p_lng is not null and p_lat is not null
      then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
      else null end as g
  )
  select count(*)::bigint
  from cafes c
  where c.duplicate_of is null
    and (c.business_status is null or c.business_status <> 'CLOSED_PERMANENTLY')
    and (
      (select g from point) is null
      or ST_DWithin(c.location, (select g from point), coalesce(p_radius_m, 5000))
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
    );
$$;

-- ------------------------------------------------------------------
-- 2.4 cafe_detail
-- ------------------------------------------------------------------
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

-- ------------------------------------------------------------------
-- 2.5 Grants
-- ------------------------------------------------------------------
grant execute on function cafe_open_at(jsonb, timestamptz) to anon, authenticated;
grant execute on function cafes_search(text[], float8, float8, int, text, int, int) to anon, authenticated;
grant execute on function cafes_search_count(text[], float8, float8, int) to anon, authenticated;
grant execute on function cafe_detail(uuid) to anon, authenticated;
