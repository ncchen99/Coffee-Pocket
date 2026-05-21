import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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
    const { cafe_id, tag_key, vote } = body ?? {};
    if (!cafe_id || !tag_key || ![1, -1, 0].includes(vote)) {
      return json({ error: "invalid payload" }, 400);
    }

    if (vote === 0) {
      const { error: delErr } = await userClient
        .from("tag_votes")
        .delete()
        .eq("cafe_id", cafe_id)
        .eq("tag_key", tag_key)
        .eq("user_id", user.id);
      if (delErr) return json({ error: delErr.message }, 500);
    } else {
      const { error: upErr } = await userClient
        .from("tag_votes")
        .upsert(
          {
            cafe_id,
            tag_key,
            user_id: user.id,
            vote,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "cafe_id,tag_key,user_id" },
        );
      if (upErr) return json({ error: upErr.message }, 500);
    }

    // Fetch fresh aggregate
    const { data: rows, error: selErr } = await userClient
      .from("tag_votes")
      .select("vote, user_id")
      .eq("cafe_id", cafe_id)
      .eq("tag_key", tag_key);

    if (selErr) return json({ error: selErr.message }, 500);

    let up = 0, down = 0;
    let myVote: 1 | -1 | null = null;
    for (const r of rows ?? []) {
      if (r.vote === 1) up++;
      else if (r.vote === -1) down++;
      if (r.user_id === user.id) myVote = r.vote === 1 ? 1 : r.vote === -1 ? -1 : null;
    }

    return json({ ok: true, vote_up: up, vote_down: down, my_vote: myVote });
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
