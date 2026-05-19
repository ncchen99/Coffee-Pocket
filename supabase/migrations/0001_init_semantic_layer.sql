-- Coffee Pocket — Initial schema for Semantic Layer v1.0
-- 對應文件：specs/SPEC.md §5, specs/AGENTS.md, specs/semantic_layer.yaml

create extension if not exists postgis;

-- ------------------------------------------------------------------
-- 1. sources：資料來源註冊表
-- ------------------------------------------------------------------
create table sources (
    id          text primary key,                       -- 'google_places' | 'cafe_nomad' | 'instagram' | 'community'
    display_name text not null,
    priority    int not null,                           -- 衝突仲裁優先序（數值越大優先）
    created_at  timestamptz not null default now()
);

insert into sources (id, display_name, priority) values
    ('community',     'Community Edit',  100),
    ('google_places', 'Google Places',    60),
    ('instagram',     'Instagram',        40),
    ('cafe_nomad',    'Cafe Nomad',       20);

-- ------------------------------------------------------------------
-- 2. users：登入使用者（與 Supabase auth.users 對應）
-- ------------------------------------------------------------------
create table users (
    id          uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    avatar_url  text,
    role        text not null default 'member',         -- 'member' | 'moderator' | 'admin'
    created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 3. cafes：店家基本資料
-- ------------------------------------------------------------------
create table cafes (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    address         text,
    phone           text,
    instagram_url   text,
    google_maps_url text,
    google_place_id text unique,
    cafe_nomad_id   text unique,
    location        geography(point, 4326) not null,    -- PostGIS 經緯度
    business_hours  jsonb,                              -- 結構化營業時間（依星期）
    photos          jsonb,                              -- [{url, source, ...}]
    summary_ai      text,                               -- AI 生成的情境摘要
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index cafes_location_gix on cafes using gist (location);
create index cafes_name_idx on cafes (name);

-- ------------------------------------------------------------------
-- 4. cafe_tags：店家 → 標籤（Semantic Layer 最終結果）
-- ------------------------------------------------------------------
create table cafe_tags (
    id              uuid primary key default gen_random_uuid(),
    cafe_id         uuid not null references cafes(id) on delete cascade,
    tag_key         text not null,                      -- e.g. 'socket_available'
    tag_type        text not null,                      -- 'boolean' | 'score' | 'structured'
    bool_value      boolean,
    score_value     int,                                -- 0–100
    structured_value jsonb,                             -- e.g. {status, duration_minutes, conditions}
    confidence      numeric(4,3) not null,              -- 0.000–1.000
    last_verified_at date not null default current_date,
    locked_by_community boolean not null default false, -- 社群編輯鎖（覆蓋 AI）
    updated_at      timestamptz not null default now(),
    unique (cafe_id, tag_key),
    check (
        (tag_type = 'boolean'    and bool_value is not null) or
        (tag_type = 'score'      and score_value between 0 and 100) or
        (tag_type = 'structured' and structured_value is not null)
    )
);

create index cafe_tags_cafe_idx on cafe_tags (cafe_id);
create index cafe_tags_key_idx on cafe_tags (tag_key);
create index cafe_tags_score_idx on cafe_tags (tag_key, score_value desc);

-- ------------------------------------------------------------------
-- 5. tag_evidence：每個標籤的證據（可追溯性）
-- ------------------------------------------------------------------
create table tag_evidence (
    id          uuid primary key default gen_random_uuid(),
    cafe_tag_id uuid not null references cafe_tags(id) on delete cascade,
    source_id   text not null references sources(id),
    review_id   uuid,                                   -- 指向 reviews_raw.id（可為 null）
    text        text,                                   -- 證據文字片段
    confidence  numeric(4,3) not null,
    extra       jsonb,                                  -- 來源特定欄位（如 cafe_nomad 的 field 值）
    created_at  timestamptz not null default now()
);

create index tag_evidence_tag_idx on tag_evidence (cafe_tag_id);

-- ------------------------------------------------------------------
-- 6. reviews_raw：抓回但尚未或已語意化的評論 / 貼文
-- ------------------------------------------------------------------
create table reviews_raw (
    id              uuid primary key default gen_random_uuid(),
    cafe_id         uuid not null references cafes(id) on delete cascade,
    source_id       text not null references sources(id),
    external_id     text,                               -- 來源原始 ID（如 Google review id）
    author          text,
    rating          numeric(2,1),
    text            text not null,
    posted_at       timestamptz,
    fetched_at      timestamptz not null default now(),
    processed_at    timestamptz,                        -- LLM 萃取完成時間
    extracted_signals jsonb,                            -- LLM 萃取結果（debug 用）
    unique (source_id, external_id)
);

create index reviews_raw_cafe_idx on reviews_raw (cafe_id);
create index reviews_raw_unprocessed_idx on reviews_raw (cafe_id) where processed_at is null;

-- ------------------------------------------------------------------
-- 7. edits：社群編輯歷史
-- ------------------------------------------------------------------
create table edits (
    id          uuid primary key default gen_random_uuid(),
    cafe_id     uuid not null references cafes(id) on delete cascade,
    user_id     uuid not null references users(id),
    target      text not null,                          -- 'cafe' | 'tag:<tag_key>'
    before_value jsonb,
    after_value jsonb,
    note        text,
    created_at  timestamptz not null default now()
);

create index edits_cafe_idx on edits (cafe_id);
create index edits_user_idx on edits (user_id);

-- ------------------------------------------------------------------
-- 8. dead_letter：LLM 萃取失敗的記錄（人工處理用）
-- ------------------------------------------------------------------
create table dead_letter (
    id          uuid primary key default gen_random_uuid(),
    source_id   text not null references sources(id),
    payload     jsonb not null,                         -- 原始輸入（評論 / 批次）
    error       text not null,
    retry_count int not null default 0,
    created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 9. RLS（基本骨架，正式策略待後續 migration）
-- ------------------------------------------------------------------
alter table cafes        enable row level security;
alter table cafe_tags    enable row level security;
alter table tag_evidence enable row level security;
alter table reviews_raw  enable row level security;
alter table edits        enable row level security;
alter table users        enable row level security;

-- 公開讀取
create policy "public read cafes"        on cafes        for select using (true);
create policy "public read cafe_tags"    on cafe_tags    for select using (true);
create policy "public read tag_evidence" on tag_evidence for select using (true);

-- 自己讀寫自己的 profile
create policy "self read users"  on users for select using (auth.uid() = id);
create policy "self write users" on users for update using (auth.uid() = id);

-- 登入使用者可新增 edits
create policy "auth insert edits" on edits for insert
    with check (auth.uid() = user_id);
create policy "self read edits"   on edits for select using (auth.uid() = user_id);
