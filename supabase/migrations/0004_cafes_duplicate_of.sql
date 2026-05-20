-- Track duplicate cafe rows.
-- The same physical cafe can appear twice when imports use different name
-- casing ("BELONGINN" vs "belonginn") or when Places API resolves two
-- distinct rows to the same google_place_id. Rather than hard-deleting,
-- we point the loser at the canonical row so history and foreign keys
-- (cafe_tags, etc.) stay intact.

alter table cafes
    add column if not exists duplicate_of uuid references cafes(id) on delete set null;

create index if not exists cafes_duplicate_of_idx on cafes (duplicate_of);
