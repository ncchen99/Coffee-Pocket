-- 0033_cafe_recommendations.sql
--
-- 使用者推薦的咖啡廳：前端只把選到的店家寫進這張表，不直接觸發 pipeline。
-- 後續由 import_recommendations 腳本批次匯入到 cafes / 跑完整 pipeline。
--
-- 為什麼不直接寫 cafes：
--   ・避免任何登入使用者就能讓 pipeline (Playwright + LLM, 每次幾分鐘 + 花費 API 費用)
--     被觸發 → 易被濫用。
--   ・讓站長能先檢視 / 過濾推薦清單再決定要不要匯入。
--
-- status 流程：
--   pending  → 等待匯入
--   imported → 已寫入 cafes（imported_cafe_id, imported_at 會填）
--   skipped  → 重複或不適合（手動標記）

create table cafe_recommendations (
    id uuid primary key default gen_random_uuid(),
    google_place_id text not null,
    name text not null,
    address text,
    lng double precision not null,
    lat double precision not null,
    google_maps_url text,
    recommended_by uuid references auth.users(id) on delete set null,
    note text,
    status text not null default 'pending'
        check (status in ('pending', 'imported', 'skipped')),
    imported_cafe_id uuid references cafes(id) on delete set null,
    imported_at timestamptz,
    created_at timestamptz not null default now()
);

-- 同一使用者對同一店家只記一筆；不同使用者可重複推薦同一店家（看得出熱度）。
-- recommended_by 為 null（匿名）時 unique 視為相異，每筆都會被允許，這對匿名是可接受的。
create unique index cafe_recommendations_place_user_unique
    on cafe_recommendations (google_place_id, recommended_by);

create index cafe_recommendations_pending_idx
    on cafe_recommendations (created_at desc) where status = 'pending';

-- RLS
alter table cafe_recommendations enable row level security;

-- 任何人（含 anon）都能新增推薦；recommended_by 必須等於 auth.uid() 或為 null。
create policy "anyone can recommend" on cafe_recommendations
    for insert to anon, authenticated
    with check (recommended_by is null or recommended_by = auth.uid());

-- 使用者可以看到自己提交的推薦（讓前端能在 UI 顯示「已推薦」狀態）。
create policy "users see own recommendations" on cafe_recommendations
    for select to authenticated
    using (recommended_by is not null and recommended_by = auth.uid());

-- 站長腳本用 service role key，會 bypass RLS，這裡不額外開 update/delete 給一般使用者。

comment on table cafe_recommendations is
    '使用者推薦的咖啡廳清單；由 import_recommendations 腳本批次匯入到 cafes 並觸發 pipeline。';
