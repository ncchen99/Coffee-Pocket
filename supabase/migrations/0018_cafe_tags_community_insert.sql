-- Coffee Pocket — Restore a constrained client-side insert path for cafe_tags.
--
-- Background:
--   0016 revoked all direct writes from authenticated users on cafe_tags,
--   reasoning that pipeline-grade writes should only happen via service-role
--   Edge Functions. But the frontend "新增標籤" flow (AddTagModal → addCafeTag)
--   still hits the table directly and is now broken with:
--     new row violates row-level security policy for table "cafe_tags"
--
-- Design:
--   We re-open insert/update for authenticated users, but pin the column shape
--   so the only thing a user can do is mark a boolean tag as community-locked.
--   Pipeline writes (score/structured tags, confidence tuning, evidence rows)
--   continue to go through the service role and remain unconstrained.

-- Allow authenticated users to insert community-vouched boolean tags only.
-- The locked_by_community + tag_type + bool_value triple matches exactly what
-- `addCafeTag` in web/src/lib/api.ts produces.
create policy "authenticated insert community cafe_tags" on cafe_tags
for insert to authenticated
with check (
  tag_type = 'boolean'
  and bool_value = true
  and locked_by_community = true
);

-- `addCafeTag` uses upsert (insert ... on conflict do update). For the conflict
-- branch we need an update policy too. Same column constraints apply — users
-- can only converge a row to the community-locked boolean=true state. They
-- cannot flip score tags or wipe pipeline metadata.
create policy "authenticated update community cafe_tags" on cafe_tags
for update to authenticated
using (true)
with check (
  tag_type = 'boolean'
  and bool_value = true
  and locked_by_community = true
);
