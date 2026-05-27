-- 0032_secure_spatial_ref_sys_and_profiles.sql
--
-- Security hardening:
-- Secure the `public_user_profiles` view by explicitly revoking all modifications (insert/update/delete)
-- from public, anon, and authenticated roles, and defining INSTEAD OF rules to make it strictly read-only.
--

-- ------------------------------------------------------------------
-- 1. Secure public_user_profiles view
-- ------------------------------------------------------------------
-- Explicitly revoke all privileges and grant only select to anon and authenticated
revoke all on public_user_profiles from anon, authenticated, public;
grant select on public_user_profiles to anon, authenticated;

-- Add rules to ensure the view is strictly read-only, preventing any updates/deletes/inserts
create or replace rule no_insert_public_user_profiles as
  on insert to public_user_profiles do instead nothing;

create or replace rule no_update_public_user_profiles as
  on update to public_user_profiles do instead nothing;

create or replace rule no_delete_public_user_profiles as
  on delete to public_user_profiles do instead nothing;
