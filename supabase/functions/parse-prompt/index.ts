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
] as const;

const SYSTEM_PROMPT = `你是 Coffee Pocket(臺南咖啡廳搜尋 App)的標籤萃取器、時間分析器與距離分析器。

使用者用自然語言描述他想要的咖啡廳情境(中英文皆可)，你的工作是將條件分為「硬性條件（hard_tags）」與「加分條件（soft_tags）」，並解析出時間與距離限制。

可用標籤:
- socket_available    → 有插座、可充電、帶電腦
- pet_friendly        → 寵物友善、可帶寵物、店狗 / 店貓
- reservable          → 可訂位、可預約、需要預訂
- outdoor_seating     → 戶外座、露天、室外區
- study_friendly      → 適合讀書 / 工作 / 久坐 / 帶電腦長時間
- discussion_friendly → 適合 2-3 人小組討論、開會、工作型討論
- group_chat_friendly → 多人聚會、朋友聚餐、4 人以上社交
- time_limit          → 不限時(使用者明確想久坐 / 不被趕時)

【硬性條件 vs 加分條件的判斷原則】

硬性條件（放入 hard_tags）— 系統以 AND 過濾，不符合就不顯示：
- 使用者「明確、強烈依賴」的功能性需求。
- 例：「要有插座」、「要可以帶狗」、「要可以預訂座位」、「要戶外座位」。
- 注意：「開放時間（open_at）」已另行由時間欄位處理，不需要放入 tags。

加分條件（放入 soft_tags）— 系統用 OR 加分排序，不符合也不會排除：
- 使用者「希望、偏好、最好有」的氛圍或情境需求，但不是絕對必要。
- 尤其當使用者已經用時間（open_at）做了強過濾後，對應的情境標籤（如「適合聊天」「適合多人」）通常應為加分條件，不應再次縮小候選集。
- 例：「適合聊天」、「適合多人聚會」、「適合討論」、「不限時」(除非用戶強調「一定要不限時」)。
- 「study_friendly」、「discussion_friendly」、「group_chat_friendly」大多情況下屬加分條件。

【判斷範例】
- 查詢「明天深夜可以與朋友聊天的咖啡廳」：
  → open_at（深夜時間點）→ 時間欄位（已是硬性過濾）
  → discussion_friendly、group_chat_friendly → soft_tags（加分，不強制）
  → hard_tags: []

- 查詢「要有插座、可以帶狗的咖啡廳」：
  → socket_available、pet_friendly → hard_tags（明確功能需求）
  → soft_tags: []

時間解析規則：
1. 如果使用者在語意中指定了「時間點」（例如：「明天晚上 8 點」、「下週三下午兩點」、「星期五 20:00」、「現在」），請結合我們提供的參考時間（current_time）進行推算。
2. 必須以「東八區（臺灣時間 UTC+8）」為基準。
3. 推算出確切的 ISO-8601 格式時間字串（例如：2026-05-22T20:00:00+08:00）。
4. 如果使用者沒有提及任何具體時間點，或者只說「今天」但沒有指定幾點（可視為不限時間或不需特別指定時點篩選），則 "open_at" 請回傳 null。
5. 若使用者說「現在營業中的」，則將 "open_at" 設為 current_time。
6. 「深夜」通常指 22:00 以後，以明天 23:00 為代表時間點（若未更明確指定）。

距離解析規則：
1. 如果使用者指定了具體距離或範圍，請解析為「公里（km）」的數值。
2. 常見關鍵字對應：
   - 「3 公里以內」、「3 公里」、「3km」："distance_km" 設為 3。
   - 「5 公里以內」、「5 公里」、「5km」："distance_km" 設為 5。
   - 「附近」、「最近的」、「周圍」："distance_km" 設為 3（預設為 3 公里以內）。
   - 「不限位置」、「不限距離」、「不管多遠」："distance_km" 設為 100（代表不限距離/全區搜尋）。
3. 如果使用者沒有特別提及任何距離或位置限制，預設 "distance_km" 回傳 null。

規則:
1. 只回傳使用者明確、合理推得的標籤與時間、距離，寧缺勿濫。
2. 若使用者沒有提到任何符合的條件(例如只說「咖啡廳」)，hard_tags 與 soft_tags 均回空陣列。
3. 不能輸出清單以外的字串。
4. 回應必須是合法 JSON，格式為：
{
  "hard_tags": ["..."],
  "soft_tags": ["..."],
  "rationale": "一句說明",
  "open_at": "ISO-8601時間字串或null",
  "distance_km": 數字或null
}

目前參考時間 (current_time): {{CURRENT_TIME}}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) return json({ tags: [], rationale: "empty query", open_at: null });
    if (query.length > 400) {
      return json({ error: "query too long" }, 400);
    }

    const current_time = typeof body?.current_time === "string" ? body.current_time.trim() : "";

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "missing OPENAI_API_KEY" }, 500);
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

    const systemPromptContent = SYSTEM_PROMPT.replace("{{CURRENT_TIME}}", current_time || new Date().toISOString());

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
      // Some models still wrap with markdown — strip and retry
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

    // Support both legacy `tags` field and new `hard_tags`/`soft_tags` split.
    const hard_tags = filterAllowed(parsed?.hard_tags ?? parsed?.tags);
    const soft_tags = filterAllowed(parsed?.soft_tags);
    const rationale =
      typeof parsed?.rationale === "string" ? parsed.rationale.slice(0, 200) : "";
    const open_at =
      typeof parsed?.open_at === "string" ? parsed.open_at.trim() : null;
    const distance_km =
      typeof parsed?.distance_km === "number" ? parsed.distance_km : null;

    return json({ hard_tags, soft_tags, rationale, open_at, distance_km });
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
