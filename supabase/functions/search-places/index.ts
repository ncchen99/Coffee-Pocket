// search-places — 用 Google Places Text Search 找店家，並標出 DB 已有的記錄。
//
// 為什麼存在?
//   原本由 services/api/main.py(FastAPI on VM)處理。把這個搜尋搬進 Edge Function
//   後,VM 上只剩 import_recommendations 這個由站長手動執行的腳本,VM 可以關掉了。
//
// Input:  { query: string }
// Output: { results: PlaceResult[] }
//
// Secrets:
//   - GOOGLE_PLACES_API_KEY
//   - SUPABASE_URL      (runtime 自動注入)
//   - SUPABASE_ANON_KEY (runtime 自動注入)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const TEXT_SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.primaryType",
].join(",");

// 候選清單上限 — 5 個夠選了,太多反而眼花。對齊 services/api/main.py 的 _MAX_RESULTS。
const MAX_RESULTS = 5;

interface PlaceResult {
  place_id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  google_maps_url: string | null;
  already_exists: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GOOGLE_PLACES_API_KEY missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid json body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const query = (body.query ?? "").trim();
  if (!query || query.length > 200) {
    return new Response(
      JSON.stringify({ error: "query must be 1-200 chars" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 偏向台南 — 我們目前只服務這個區域,沒這個 boost 會被 Taipei 連鎖店淹沒。
  // 使用者真想找非台南店,Places 還是會回,只是排序往後。
  const placesBody = {
    textQuery: `${query} 台南`,
    languageCode: "zh-TW",
    regionCode: "TW",
    maxResultCount: MAX_RESULTS,
  };

  let placesJson: { places?: any[] };
  try {
    const r = await fetch(TEXT_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(placesBody),
    });
    if (!r.ok) {
      const text = await r.text();
      console.warn("Places API error", r.status, text);
      return new Response(
        JSON.stringify({ error: `Places API error (HTTP ${r.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    placesJson = await r.json();
  } catch (e) {
    console.warn("Places API fetch failed", e);
    return new Response(
      JSON.stringify({ error: "Places API fetch failed" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const rawPlaces = placesJson.places ?? [];
  const pids = rawPlaces.map((p) => p.id).filter((x): x is string => !!x);

  // 標出 DB 已存在的 place_id。用 anon key + RLS 即可 — cafes.google_place_id 是
  // 公開可讀的(SELECT policy 已開),不需要 service role。
  const existingPids = new Set<string>();
  if (pids.length > 0) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data, error } = await supabase
      .from("cafes")
      .select("google_place_id")
      .in("google_place_id", pids);
    if (error) {
      console.warn("supabase lookup failed", error);
      // 不致命 — 大不了 already_exists 全部 false,使用者送出後 unique index 還是會擋。
    } else {
      for (const row of data ?? []) {
        if (row.google_place_id) existingPids.add(row.google_place_id as string);
      }
    }
  }

  const results: PlaceResult[] = [];
  for (const p of rawPlaces) {
    const loc = p.location ?? {};
    const lat = loc.latitude, lng = loc.longitude;
    if (lat == null || lng == null) continue;
    const pid = p.id;
    if (!pid) continue;
    results.push({
      place_id: pid,
      name: p.displayName?.text ?? "(no name)",
      address: p.formattedAddress ?? null,
      lat: Number(lat),
      lng: Number(lng),
      google_maps_url: p.googleMapsUri ?? null,
      already_exists: existingPids.has(pid),
    });
  }

  return new Response(
    JSON.stringify({ results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
