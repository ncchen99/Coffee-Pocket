import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const VALID_TYPES = ["closed", "duplicate", "wrong", "other"] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "unauthenticated" }, 401);

    const body = await req.json();
    const { cafe_id, type, note } = body ?? {};
    if (!cafe_id || !type || !VALID_TYPES.includes(type)) {
      return json({ error: "invalid payload" }, 400);
    }

    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error: countErr } = await userClient
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", user.id)
      .gte("created_at", since);
    if (countErr) return json({ error: countErr.message }, 500);
    if ((count ?? 0) >= 10) {
      return json({ error: "rate_limited", message: "Max 10 reports per 24 hours" }, 429);
    }

    const { data: inserted, error: insertErr } = await userClient
      .from("reports")
      .insert({
        cafe_id,
        type,
        note: note ?? null,
        reporter_id: user.id,
      })
      .select("id")
      .single();

    if (insertErr) return json({ error: insertErr.message }, 500);
    return json({ ok: true, report_id: inserted.id });
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
