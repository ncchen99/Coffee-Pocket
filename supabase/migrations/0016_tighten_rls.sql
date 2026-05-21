-- Coffee Pocket — Tighten RLS policies
--
-- Closes the following issues found in the 2026-05-21 audit:
--   1. cafe_tags: any authenticated user could insert/update arbitrary tag rows,
--      bypassing the edits/votes workflow. Writes must go through Edge Functions
--      (service role) only.
--   2. pocket_items: pockets had a public-read policy for is_public=true, but
--      pocket_items did not — public pockets appeared empty to non-owners.
--   3. tag_votes: public select exposed per-user voting history (user_id leak).
--      Reads are restricted to the voter themselves; aggregate counts come from
--      the cafe_detail() RPC.
--   4. users: only self could read; we expose a minimal public profile view so
--      pocket/edit author names + avatars can render.
--   5. sources / dead_letter: RLS was never enabled — anon role had read access.
--      Pipeline-only tables, lock down to service role.

-- ------------------------------------------------------------------
-- 1. cafe_tags: revoke direct writes from authenticated role
-- ------------------------------------------------------------------
drop policy if exists "authenticated insert cafe_tags" on cafe_tags;
drop policy if exists "authenticated update cafe_tags" on cafe_tags;

-- (DELETE policy was already dropped in 0015. Public select policy from 0001
--  remains so clients can read tags.)

-- ------------------------------------------------------------------
-- 2. pocket_items: allow public read when the parent pocket is public
-- ------------------------------------------------------------------
drop policy if exists "public select pocket_items" on pocket_items;
create policy "public select pocket_items" on pocket_items for select using (
  exists (
    select 1 from pockets p
    where p.id = pocket_items.pocket_id
      and p.is_public = true
  )
);

-- ------------------------------------------------------------------
-- 3. tag_votes: restrict select to the voter; aggregates via cafe_detail()
-- ------------------------------------------------------------------
drop policy if exists "public select tag_votes" on tag_votes;
drop policy if exists "self select tag_votes" on tag_votes;
create policy "self select tag_votes" on tag_votes for select using (
  auth.uid() = user_id
);

-- cafe_detail() needs to count tag_votes regardless of caller. Mark it
-- SECURITY DEFINER so the embedded counts run as the function owner and
-- bypass the new self-only select policy. The function only returns
-- aggregate counts (vote_up / vote_down), never per-user rows, so this
-- does not leak voter identity.
alter function cafe_detail(uuid) security definer;

-- ------------------------------------------------------------------
-- 4. users: keep self-only RLS, expose a minimal public profile view
-- ------------------------------------------------------------------
-- The view runs with the owner's privileges (security_invoker = false,
-- the default), so it bypasses the self-only RLS on `users` — but only
-- the columns listed below are exposed. email and other private columns
-- never leave the table.
create or replace view public_user_profiles as
  select id, display_name, avatar_url
  from users;

grant select on public_user_profiles to anon, authenticated;

-- ------------------------------------------------------------------
-- 5. Lock down pipeline-only tables
-- ------------------------------------------------------------------
alter table sources     enable row level security;
alter table dead_letter enable row level security;

-- No policies → only service role can read/write. Pipeline runs use the
-- service role key, anon/authenticated clients have no access.
