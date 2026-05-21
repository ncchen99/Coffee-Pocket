-- pocket_cafes(p_pocket_id) — 回傳一個口袋裡的所有 cafe(含 lng/lat),
-- 給前端「在地圖上看這個口袋」用。
--
-- 為什麼要新增 RPC?
--   cafes 表的座標欄位是 PostGIS `location geography(point, 4326)`,
--   PostgREST 沒辦法直接從 `select=cafe:cafes(...,lng,lat)` 取出
--   (那會解讀成欄位名,但表上沒有這兩個欄位,42703)。
--   要在 SQL 層用 ST_X/ST_Y 投影出來。
--
-- 安全性:
--   SECURITY INVOKER(預設) —— 走呼叫者身分 + RLS。
--   pocket_items 的 RLS(0016)允許「擁有者」或「pocket 是 public」時 SELECT,
--   cafes 是公開讀取,所以照常套用即可。
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
  lat             double precision
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
    ST_Y(c.location::geometry) as lat
  from pocket_items pi
  join cafes c on c.id = pi.cafe_id
  where pi.pocket_id = p_pocket_id
  order by pi.added_at desc;
$$;

grant execute on function pocket_cafes(uuid) to anon, authenticated;
