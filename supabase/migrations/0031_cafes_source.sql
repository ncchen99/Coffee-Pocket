-- 0031_cafes_source.sql
--
-- Track how each cafe row got into the DB.
--
-- Until now we could only infer origin indirectly (e.g. `cafe_nomad_id is not
-- null` → imported from Cafe Nomad). With user-submitted additions arriving
-- via the FastAPI service in `services/api/`, we need an explicit column so
-- (a) operators can audit / filter user submissions, and (b) the frontend can
-- show a "由使用者新增" badge if we want it later.
--
-- Values
-- ------
--   'system'         — seeded by the data pipeline (Cafe Nomad import, manual
--                      insert scripts, Tainan list scrape, etc.).
--                      Everything that exists *today* is system-seeded.
--   'user_submitted' — added by a logged-in user via the /add-cafe flow.
--
-- Backfill: NOT NULL with DEFAULT 'system' takes care of existing rows in a
-- single rewrite; no separate UPDATE needed.

alter table cafes
    add column source text not null default 'system'
        check (source in ('system', 'user_submitted'));

-- Filter-by-source is rare today but cheap; partial index on user_submitted
-- keeps the moderation/audit queries fast without bloating writes.
create index cafes_source_user_submitted_idx
    on cafes (created_at desc)
    where source = 'user_submitted';

comment on column cafes.source is
    'How this cafe row was created. ''system'' = seeded by the data pipeline; ''user_submitted'' = added via the /add-cafe flow.';
