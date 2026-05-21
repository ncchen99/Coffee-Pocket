-- ------------------------------------------------------------------
-- Upgraded cafe_open_at — check if business_hours indicates open at p_at
-- Handles both legacy object array format and new scraped string range format
-- ------------------------------------------------------------------

create or replace function cafe_open_at(p_hours jsonb, p_at timestamptz default now())
returns boolean
language plpgsql
immutable
as $$
declare
  v_local            timestamp;
  v_dow              int;
  v_dow_name_short   text;
  v_dow_name_long    text;
  v_slots            jsonb;
  v_slot             jsonb;
  v_slot_str         text;
  v_parts            text[];
  v_open             time;
  v_close            time;
  v_t                time;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'object' then
    return null;
  end if;

  begin
    v_local := (p_at at time zone 'Asia/Taipei')::timestamp;
    v_dow := extract(dow from v_local)::int; -- 0=Sun..6=Sat
    v_t := v_local::time;

    -- Generate candidate keys (e.g. 'mon' vs 'monday')
    v_dow_name_short := case v_dow
      when 0 then 'sun'
      when 1 then 'mon'
      when 2 then 'tue'
      when 3 then 'wed'
      when 4 then 'thu'
      when 5 then 'fri'
      when 6 then 'sat'
    end;

    v_dow_name_long := case v_dow
      when 0 then 'sunday'
      when 1 then 'monday'
      when 2 then 'tuesday'
      when 3 then 'wednesday'
      when 4 then 'thursday'
      when 5 then 'friday'
      when 6 then 'saturday'
    end;

    -- Lookup slots using candidate keys
    v_slots := p_hours -> v_dow_name_short;
    if v_slots is null then
      v_slots := p_hours -> v_dow_name_long;
    end if;

    -- If the value is a single string, wrap it in an array for uniform iteration
    if jsonb_typeof(v_slots) = 'string' then
      v_slots := jsonb_build_array(v_slots);
    end if;

    if v_slots is null or jsonb_typeof(v_slots) <> 'array' or jsonb_array_length(v_slots) = 0 then
      return false;
    end if;

    for v_slot in select * from jsonb_array_elements(v_slots) loop
      begin
        v_open := null;
        v_close := null;

        if jsonb_typeof(v_slot) = 'object' then
          -- Support legacy object format: {"open": "09:00", "close": "18:00"}
          v_open := (v_slot->>'open')::time;
          v_close := (v_slot->>'close')::time;
        elsif jsonb_typeof(v_slot) = 'string' then
          -- Support range string format: "09:00–18:00" or "closed"
          v_slot_str := lower(trim(v_slot#>>'{}'));
          
          if v_slot_str = '' or v_slot_str in ('closed', '休', '公休', '休息', 'off') then
            continue;
          end if;

          -- Split string using common dividers: -, –, —, ~, 〜, 到
          v_parts := regexp_split_to_array(v_slot_str, '\s*([-–—~〜到])\s*');
          if array_length(v_parts, 1) = 2 then
            v_open := trim(v_parts[1])::time;
            v_close := trim(v_parts[2])::time;
          else
            continue;
          end if;
        else
          continue;
        end if;

        if v_open is null or v_close is null then
          continue;
        end if;

        -- Open hours calculation (handling overnight spans e.g., 18:00 - 02:00)
        if v_close > v_open then
          if v_t >= v_open and v_t < v_close then
            return true;
          end if;
        else
          if v_t >= v_open or v_t < v_close then
            return true;
          end if;
        end if;
      exception when others then
        continue;
      end;
    end loop;

    return false;
  exception when others then
    return null;
  end;
end;
$$;

-- Grant permissions to make function executable by anon/authenticated roles
grant execute on function cafe_open_at(jsonb, timestamptz) to anon, authenticated;
