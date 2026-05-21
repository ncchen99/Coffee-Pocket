-- Coffee Pocket — User-facing features (pockets, votes, reports, auth trigger)

-- ------------------------------------------------------------------
-- 1.1 Auth trigger: auth.users -> public.users
-- ------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ------------------------------------------------------------------
-- 1.2 users.preferences jsonb
-- ------------------------------------------------------------------
alter table users add column if not exists preferences jsonb not null default '{}'::jsonb;

-- Self-insert policy (fallback if trigger races)
drop policy if exists "self insert users" on users;
create policy "self insert users" on users for insert
    with check (auth.uid() = id);

-- ------------------------------------------------------------------
-- 1.3 pockets
-- ------------------------------------------------------------------
create table if not exists pockets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null,
  emoji      text,
  sort_order int not null default 0,
  is_public  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pockets_user_idx on pockets (user_id, sort_order);

-- ------------------------------------------------------------------
-- 1.4 pocket_items
-- ------------------------------------------------------------------
create table if not exists pocket_items (
  id            uuid primary key default gen_random_uuid(),
  pocket_id     uuid not null references pockets(id) on delete cascade,
  cafe_id       uuid not null references cafes(id) on delete cascade,
  personal_note text,
  added_at      timestamptz not null default now(),
  unique (pocket_id, cafe_id)
);
create index if not exists pocket_items_pocket_idx on pocket_items (pocket_id);
create index if not exists pocket_items_cafe_idx on pocket_items (cafe_id);

-- ------------------------------------------------------------------
-- 1.5 Extend edits
-- ------------------------------------------------------------------
alter table edits add column if not exists status text not null default 'pending';
alter table edits add column if not exists reviewer_id uuid references users(id);
alter table edits add column if not exists reviewed_at timestamptz;
alter table edits add column if not exists source_url text;
alter table edits add column if not exists source_image text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'edits_status_check'
  ) then
    alter table edits add constraint edits_status_check check (status in ('pending', 'approved', 'rejected'));
  end if;
end$$;

create index if not exists edits_status_idx on edits (status);

-- ------------------------------------------------------------------
-- 1.6 tag_votes
-- ------------------------------------------------------------------
create table if not exists tag_votes (
  id         uuid primary key default gen_random_uuid(),
  cafe_id    uuid not null references cafes(id) on delete cascade,
  tag_key    text not null,
  user_id    uuid not null references users(id) on delete cascade,
  vote       smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cafe_id, tag_key, user_id)
);
create index if not exists tag_votes_cafe_tag_idx on tag_votes (cafe_id, tag_key);

-- ------------------------------------------------------------------
-- 1.7 reports
-- ------------------------------------------------------------------
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  cafe_id     uuid not null references cafes(id) on delete cascade,
  reporter_id uuid not null references users(id),
  type        text not null check (type in ('closed', 'duplicate', 'wrong', 'other')),
  note        text,
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now()
);
create index if not exists reports_cafe_idx on reports (cafe_id);
create index if not exists reports_status_idx on reports (status);

-- ------------------------------------------------------------------
-- 1.8 RLS for new tables
-- ------------------------------------------------------------------
alter table pockets      enable row level security;
alter table pocket_items enable row level security;
alter table tag_votes    enable row level security;
alter table reports      enable row level security;

-- pockets: owner full access; public read when is_public
drop policy if exists "owner select pockets" on pockets;
create policy "owner select pockets" on pockets for select using (auth.uid() = user_id);

drop policy if exists "public select pockets" on pockets;
create policy "public select pockets" on pockets for select using (is_public = true);

drop policy if exists "owner insert pockets" on pockets;
create policy "owner insert pockets" on pockets for insert with check (auth.uid() = user_id);

drop policy if exists "owner update pockets" on pockets;
create policy "owner update pockets" on pockets for update using (auth.uid() = user_id);

drop policy if exists "owner delete pockets" on pockets;
create policy "owner delete pockets" on pockets for delete using (auth.uid() = user_id);

-- pocket_items: owner via pocket join
drop policy if exists "owner select pocket_items" on pocket_items;
create policy "owner select pocket_items" on pocket_items for select using (
  exists (select 1 from pockets p where p.id = pocket_items.pocket_id and p.user_id = auth.uid())
);

drop policy if exists "owner insert pocket_items" on pocket_items;
create policy "owner insert pocket_items" on pocket_items for insert with check (
  exists (select 1 from pockets p where p.id = pocket_items.pocket_id and p.user_id = auth.uid())
);

drop policy if exists "owner update pocket_items" on pocket_items;
create policy "owner update pocket_items" on pocket_items for update using (
  exists (select 1 from pockets p where p.id = pocket_items.pocket_id and p.user_id = auth.uid())
);

drop policy if exists "owner delete pocket_items" on pocket_items;
create policy "owner delete pocket_items" on pocket_items for delete using (
  exists (select 1 from pockets p where p.id = pocket_items.pocket_id and p.user_id = auth.uid())
);

-- tag_votes: self write; public read
drop policy if exists "public select tag_votes" on tag_votes;
create policy "public select tag_votes" on tag_votes for select using (true);

drop policy if exists "self insert tag_votes" on tag_votes;
create policy "self insert tag_votes" on tag_votes for insert with check (auth.uid() = user_id);

drop policy if exists "self update tag_votes" on tag_votes;
create policy "self update tag_votes" on tag_votes for update using (auth.uid() = user_id);

drop policy if exists "self delete tag_votes" on tag_votes;
create policy "self delete tag_votes" on tag_votes for delete using (auth.uid() = user_id);

-- reports: self insert only
drop policy if exists "self insert reports" on reports;
create policy "self insert reports" on reports for insert with check (auth.uid() = reporter_id);
