-- remove_cafe_tag:單一 RPC 同時做 clear vote + (若無人支持且無證據)刪除 cafe_tags 行
--
-- 行為:
--   1. 先刪除呼叫者自己在 (cafe_id, tag_key) 上的 tag_votes 記錄。
--   2. 若該 cafe_tag 沒有 tag_evidence(社群新增的標籤,無 LLM 證據)
--      且剩餘 tag_votes(vote=1)為 0(沒有其他人贊同) → 完全刪除 cafe_tags 行。
--      否則保留 cafe_tags 行(LLM 證據或他人投票仍存在)。
--
-- 安全性:
--   SECURITY DEFINER —— 因為 cafe_tags 沒有 DELETE policy(0015 已撤銷),
--   而我們希望在「使用者自己新增且沒人附議」時清掉這列。權限只放給
--   authenticated;函式內以 auth.uid() 驗身分。

create or replace function remove_cafe_tag(
  p_cafe_id uuid,
  p_tag_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_evidence_count int;
  v_remaining_up int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  delete from tag_votes
    where cafe_id = p_cafe_id
      and tag_key = p_tag_key
      and user_id = v_user_id;

  select count(*) into v_evidence_count
    from tag_evidence te
    join cafe_tags ct on ct.id = te.cafe_tag_id
   where ct.cafe_id = p_cafe_id
     and ct.tag_key = p_tag_key;

  select count(*) into v_remaining_up
    from tag_votes
   where cafe_id = p_cafe_id
     and tag_key = p_tag_key
     and vote = 1;

  if v_evidence_count = 0 and v_remaining_up = 0 then
    delete from cafe_tags
      where cafe_id = p_cafe_id
        and tag_key = p_tag_key;
  end if;
end;
$$;

revoke all on function remove_cafe_tag(uuid, text) from public;
grant execute on function remove_cafe_tag(uuid, text) to authenticated;
