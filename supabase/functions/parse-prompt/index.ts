// parse-prompt — turn a natural-language user query into a structured tag set.
//
// Input:  { query: string }
// Output: { tags: string[], rationale: string }
//
// `tags` are DB tag_keys defined in `specs/semantic_layer.yaml`. The frontend
// maps them back to its short keys via `data/tagMapping.ts` (DB_TO_FILTER).
//
// Secrets required (set via `supabase secrets set --env-file .env`):
//   - OPENAI_API_KEY
//   - OPENAI_MODEL (optional, defaults to gpt-4o-mini)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Whitelist — must stay in sync with semantic_layer.yaml + DB_TAG_LABEL.
const ALLOWED_TAGS = [
  "socket_available",
  "pet_friendly",
  "reservable",
  "outdoor_seating",
  "study_friendly",
  "discussion_friendly",
  "group_chat_friendly",
  "time_limit",
  "noise_level",
] as const;

const SYSTEM_PROMPT = `你是 Coffee Pocket(臺南咖啡廳搜尋 App)的標籤萃取器。

使用者用自然語言描述他想要的咖啡廳情境(中英文皆可),你的工作是回傳對應的標籤 key 清單(僅可使用以下清單)。

可用標籤:
- socket_available  → 有插座、可充電、帶電腦
- pet_friendly      → 寵物友善、可帶寵物、店狗 / 店貓
- reservable        → 可訂位、可預約、需要預訂
- outdoor_seating   → 戶外座、露天、室外區
- study_friendly    → 適合讀書 / 工作 / 久坐 / 帶電腦長時間
- discussion_friendly → 適合 2-3 人小組討論、開會、工作型討論
- group_chat_friendly → 多人聚會、朋友聚餐、4 人以上社交
- time_limit        → 不限時(使用者明確想久坐 / 不被趕時)
- noise_level       → 安靜的環境

規則:
1. 只回傳使用者明確、合理推得的標籤,寧缺勿濫。
2. 若使用者沒有提到任何符合的條件(例如只說「咖啡廳」),回空陣列。
3. 不能輸出清單以外的字串。
4. 回應必須是合法 JSON,格式 {"tags": ["..."], "rationale": "一句說明"}。`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) return json({ tags: [], rationale: "empty query" });
    if (query.length > 400) {
      return json({ error: "query too long" }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "missing OPENAI_API_KEY" }, 500);
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

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
          { role: "system", content: SYSTEM_PROMPT },
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
      // Some models still wrap with markdown — strip and retry
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const rawTags = Array.isArray(parsed?.tags) ? parsed.tags : [];
    const tags = Array.from(
      new Set(
        rawTags.filter(
          (t: unknown): t is string =>
            typeof t === "string" && (ALLOWED_TAGS as readonly string[]).includes(t),
        ),
      ),
    );
    const rationale =
      typeof parsed?.rationale === "string" ? parsed.rationale.slice(0, 200) : "";

    return json({ tags, rationale });
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
