-- Coffee Pocket — Rate-limit edits / reports via RLS subqueries
--
-- 背景：原本 submit-edit / submit-report Edge Functions 在 application 端做
--   * edits : 24h 內 ≤ 5 筆 pending
--   * reports: 24h 內 ≤ 10 筆
-- 的限速。但這兩個 function 除了限速外的工作（驗欄位、insert）都已可由 RLS
-- + table CHECK 完成。把限速搬進 RLS policy 後，就能讓前端直接以 anon key
-- 走 `supabase.from('edits' | 'reports').insert(...)`，省掉一次冷啟動。
--
-- 安全等價性：
--   * `auth.uid() = user_id` / `auth.uid() = reporter_id` 仍由 RLS 強制。
--   * 子查詢以 caller 身份執行(non-SECURITY DEFINER policy)，受 self-only
--     SELECT policy 限制 → 只看得到自己的列，無法用來推算他人活動。
--   * `reports.type` 的 enum 已由 0005 的 CHECK 約束守住，不需重複。

-- ------------------------------------------------------------------
-- 1. edits: 替換成「self insert + 5/24h pending」policy
-- ------------------------------------------------------------------
drop policy if exists "auth insert edits" on edits;
drop policy if exists "rate limited insert edits" on edits;
create policy "rate limited insert edits" on edits for insert
  with check (
    auth.uid() = user_id
    and (
      select count(*) from edits e
      where e.user_id = auth.uid()
        and e.status = 'pending'
        and e.created_at > now() - interval '24 hours'
    ) < 5
  );

-- ------------------------------------------------------------------
-- 2. reports: 替換成「self insert + 10/24h」policy
-- ------------------------------------------------------------------
drop policy if exists "self insert reports" on reports;
drop policy if exists "rate limited insert reports" on reports;
create policy "rate limited insert reports" on reports for insert
  with check (
    auth.uid() = reporter_id
    and (
      select count(*) from reports r
      where r.reporter_id = auth.uid()
        and r.created_at > now() - interval '24 hours'
    ) < 10
  );

-- ------------------------------------------------------------------
-- 3. reports: 補上 self-read policy（原本只有 insert，自己看不到自己回報）
-- ------------------------------------------------------------------
drop policy if exists "self read reports" on reports;
create policy "self read reports" on reports for select
  using (auth.uid() = reporter_id);
