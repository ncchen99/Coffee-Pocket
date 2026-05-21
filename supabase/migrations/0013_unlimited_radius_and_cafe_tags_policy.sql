-- Coffee Pocket — Allow unlimited radius search when p_radius_m is null, and allow authenticated users to add tags

drop function if exists cafes_search(text[], float8, float8, int, text, int, int, timestamptz, text[]);
drop function if exists cafes_search_count(text[], float8, float8, int, timestamptz, text[]);

-- ------------------------------------------------------------------
-- Redefine cafes_search with optional (null) radius
-- ------------------------------------------------------------------
create or replace function cafes_search(
  p_tags     text[],
  p_lng      float8,
  p_lat      float8,
  p_radius_m int,
  p_sort     text,
  p_limit    int,
  p_offset   int,
  p_open_at  timestamptz default null,
  p_tags_or  text[] default null
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
    case when coalesce(p_sort, 'distance') = 'distance' then w.dist_m end asc nulls last,
    case when p_sort = 'rating' then w.google_rating end desc nulls last,
    case when p_sort = 'popular' then w.google_rating end desc nulls last,
    w.name asc
  limit coalesce(p_limit, 20)
  offset coalesce(p_offset, 0);
$$;

-- ------------------------------------------------------------------
-- Redefine cafes_search_count with optional (null) radius
-- ------------------------------------------------------------------
create or replace function cafes_search_count(
  p_tags     text[],
  p_lng      float8,
  p_lat      float8,
  p_radius_m int,
  p_open_at  timestamptz default null,
  p_tags_or  text[] default null
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
    );
$$;

grant execute on function cafes_search(text[], float8, float8, int, text, int, int, timestamptz, text[]) to anon, authenticated;
grant execute on function cafes_search_count(text[], float8, float8, int, timestamptz, text[]) to anon, authenticated;

-- ------------------------------------------------------------------
-- RLS policies for cafe_tags table to allow authenticated inserts/updates
-- ------------------------------------------------------------------
drop policy if exists "authenticated insert cafe_tags" on cafe_tags;
create policy "authenticated insert cafe_tags" on cafe_tags
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated update cafe_tags" on cafe_tags;
create policy "authenticated update cafe_tags" on cafe_tags
  for update using (auth.role() = 'authenticated');
