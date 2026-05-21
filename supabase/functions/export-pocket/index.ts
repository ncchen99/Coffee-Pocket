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

    const { data: pockets, error: pErr } = await userClient
      .from("pockets")
      .select("id, name, emoji, created_at")
      .order("created_at", { ascending: true });
    if (pErr) return json({ error: pErr.message }, 500);

    const pocketIds = (pockets ?? []).map((p: any) => p.id);
    let itemsByPocket: Record<string, any[]> = {};
    if (pocketIds.length > 0) {
      const { data: items, error: iErr } = await userClient
        .from("pocket_items")
        .select("pocket_id, cafe_id, personal_note, added_at, cafes(name, address, google_maps_url)")
        .in("pocket_id", pocketIds);
      if (iErr) return json({ error: iErr.message }, 500);
      for (const it of items ?? []) {
        const arr = itemsByPocket[(it as any).pocket_id] ?? [];
        arr.push({
          cafe_id: (it as any).cafe_id,
          cafe_name: (it as any).cafes?.name ?? null,
          address: (it as any).cafes?.address ?? null,
          google_maps_url: (it as any).cafes?.google_maps_url ?? null,
          personal_note: (it as any).personal_note,
          added_at: (it as any).added_at,
        });
        itemsByPocket[(it as any).pocket_id] = arr;
      }
    }

    const payload = {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      pockets: (pockets ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        created_at: p.created_at,
        items: itemsByPocket[p.id] ?? [],
      })),
    };

    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="coffee-pocket-export-${date}.json"`,
      },
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
