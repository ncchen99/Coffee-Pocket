// smart-search — 一次處理「關鍵字命中 → 否則 LLM 情境解析」整個搜尋分流。
//
// 為什麼存在?
//   前端原本是兩趟 round-trip:
//     1) searchCafesCount({q})        — Postgres RPC
//     2) 若 0,parsePrompt(q)         — LLM Edge Function
//   合併之後,server 內部一次完成兩段(且 count 階段省下 client 端的 TLS),
//   LLM fallback 路徑的使用者感受時間能少一個 round-trip。
//
// Input:  { query: string, q_pinyin?: string, current_time?: string }
// Output: { matched_count: number, parsed: ParsedPrompt | null }
//
// Secrets:
//   - OPENAI_API_KEY    (parse 階段才會用到)
//   - OPENAI_MODEL      (optional, defaults to gpt-4o-mini)
//   - SUPABASE_URL      (Supabase Edge runtime 自動注入)
//   - SUPABASE_ANON_KEY (Supabase Edge runtime 自動注入)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// v2.0 — keep in sync with parse-prompt/index.ts and specs/semantic_layer.yaml.
const ALLOWED_TAGS = [
  "socket_most",
  "socket_few",
  "large_table_most",
  "large_table_few",
  "wifi_available",
  "high_cp_value",
  "scooter_parking_easy",
  "car_parking_easy",
  "has_resident_cat",
  "has_resident_dog",
  "reservable",
  "outdoor_seating",
  "study_friendly",
  "discussion_friendly",
  "group_chat_friendly",
  "time_limit",
] as const;

const SYSTEM_PROMPT = `你是 Coffee Pocket(臺南咖啡廳搜尋 App)的標籤萃取器、時間分析器與距離分析器。

使用者用自然語言描述他想要的咖啡廳情境(中英文皆可)，你的工作是將條件分為「硬性條件（hard_tags）」與「加分條件（soft_tags）」，並解析出時間與距離限制。

可用標籤(v2.0):
- socket_most           → 多數座位有插座
- socket_few            → 少數座位有插座
- large_table_most      → 多數是大桌（4 人以上）
- large_table_few       → 偶有大桌
- wifi_available        → 有 Wi-Fi
- high_cp_value         → 高 CP 值、便宜大碗
- scooter_parking_easy  → 機車好停
- car_parking_easy      → 汽車好停
- has_resident_cat      → 有店貓（駐店動物，不是「可帶寵物」）
- has_resident_dog      → 有店狗
- reservable            → 可訂位、可預約
- outdoor_seating       → 戶外座、露天
- study_friendly        → 適合一人讀書 / 工作 / 久坐
- discussion_friendly   → 適合 2-3 人小組討論、開會
- group_chat_friendly   → 4 人以上多人聚會、朋友聚餐
- time_limit            → 不限時 / 久坐

【硬性條件 vs 加分條件的判斷原則】

硬性條件（放入 hard_tags）— 系統以 AND 過濾，不符合就不顯示：
- 使用者「明確、強烈依賴」的功能性需求。

加分條件（放入 soft_tags）— 系統用 OR 加分排序，不符合也不會排除：
- 使用者「希望、偏好、最好有」的氛圍或情境需求，但不是絕對必要。

時間解析規則：
1. 「時間點」結合 current_time 推算,以東八區(UTC+8)為基準,輸出 ISO-8601。
2. 未提及具體時間 → "open_at" 為 null。
3. 「現在營業中的」→ "open_at" = current_time。
4. 模糊時段:早上 09:00、中午 12:00、下午 15:00、傍晚 18:00、晚上 20:00、
   深夜次日 00:00、凌晨次日 02:00。
5. 同時提供具體時間以具體時間為準。

距離解析規則：
1. 解析為公里(km)數值。
2. 「3 公里」→ 3;「附近 / 最近的」→ 3;「不限距離」→ 100;未提及 → null。

規則:
1. 寧缺勿濫,只輸出明確、合理推得的標籤與時間、距離。
2. 不能輸出清單以外的字串。
3. 回應為合法 JSON:
{ "hard_tags": ["..."], "soft_tags": ["..."], "rationale": "一句說明", "open_at": null|"ISO", "distance_km": null|number }

目前參考時間 (current_time): {{CURRENT_TIME}}`;

interface SmartSearchBody {
  query?: string;
  q_pinyin?: string | null;
  current_time?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as SmartSearchBody;
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return json({ matched_count: 0, parsed: null });
    }
    if (query.length > 400) {
      return json({ error: "query too long" }, 400);
    }

    // ---- 1) 關鍵字 count(走 cafes_search_count RPC) ----
    const supaUrl = Deno.env.get("SUPABASE_URL");
    const supaAnon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supaUrl || !supaAnon) {
      return json({ error: "missing supabase env" }, 500);
    }

    // 沿用呼叫端 Authorization 讓 RLS 正常工作(雖然 cafes 是公開讀的)。
    const authHeader = req.headers.get("Authorization") ?? `Bearer ${supaAnon}`;
    const supabase = createClient(supaUrl, supaAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const q_pinyin = typeof body.q_pinyin === "string" ? body.q_pinyin : null;
    const { data: countData, error: countError } = await supabase.rpc(
      "cafes_search_count",
      {
        p_tags: [],
        p_lng: null,
        p_lat: null,
        p_radius_m: null,
        p_open_at: null,
        p_tags_or: null,
        p_q: query,
        p_q_pinyin: q_pinyin,
      },
    );
    if (countError) {
      return json({ error: "count_failed", detail: countError.message }, 500);
    }
    const matched_count = Number(countData ?? 0);
    if (matched_count > 0) {
      return json({ matched_count, parsed: null });
    }

    // ---- 2) 命中數為 0 → LLM 情境解析 ----
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "missing OPENAI_API_KEY" }, 500);
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const current_time =
      typeof body.current_time === "string" && body.current_time.trim()
        ? body.current_time.trim()
        : new Date().toISOString();
    const systemPromptContent = SYSTEM_PROMPT.replace("{{CURRENT_TIME}}", current_time);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPromptContent },
          { role: "user", content: query },
        ],
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return json({ error: "llm_failed", detail: txt.slice(0, 500) }, 502);
    }

    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const filterAllowed = (arr: unknown): string[] =>
      Array.from(
        new Set(
          (Array.isArray(arr) ? arr : []).filter(
            (t: unknown): t is string =>
              typeof t === "string" && (ALLOWED_TAGS as readonly string[]).includes(t),
          ),
        ),
      );

    const hard_tags = filterAllowed(parsed?.hard_tags ?? parsed?.tags);
    const soft_tags = filterAllowed(parsed?.soft_tags);
    const rationale =
      typeof parsed?.rationale === "string" ? parsed.rationale.slice(0, 200) : "";
    const open_at =
      typeof parsed?.open_at === "string" ? parsed.open_at.trim() : null;
    const distance_km =
      typeof parsed?.distance_km === "number" ? parsed.distance_km : null;

    return json({
      matched_count: 0,
      parsed: { hard_tags, soft_tags, rationale, open_at, distance_km },
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
