import { supabase } from "./supabase";
import { filterKeysToDb, dbTagLabel } from "@/data/tagMapping";
import type {
  CafeCard,
  CafeDetail,
  Pocket,
  PocketItem,
  UserStats,
  Contribution,
  UserPreferences,
  TagDetail,
  TagWithConfidence,
  PlatformTagKey,
} from "@/types/cafe";

// ===========================================================================
// Search
// ===========================================================================

export interface SearchParams {
  tags?: string[]; // frontend short keys (e.g. "socket")
  lng?: number | null;
  lat?: number | null;
  radius_m?: number; // default 5000
  sort?: "distance" | "rating" | "popular";
  limit?: number; // default 50
  offset?: number;
}

export interface SearchResult {
  cafes: CafeCard[];
  total: number;
}

interface CafeSearchRow {
  id: string;
  name: string;
  cover_image_url: string | null;
  top_tags: string[] | null;
  distance_m: number | null;
  open_now: boolean | null;
  closes_at: string | null;
  lng: number;
  lat: number;
  google_rating: number | null;
  total_count: number | null;
}

function rpcArgsForSearch(params: SearchParams) {
  return {
    p_tags: filterKeysToDb(params.tags ?? []),
    p_lng: params.lng ?? null,
    p_lat: params.lat ?? null,
    p_radius_m: params.radius_m ?? 5000,
    p_sort: params.sort ?? "distance",
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  };
}

export async function searchCafes(params: SearchParams): Promise<SearchResult> {
  const { data, error } = await supabase.rpc("cafes_search", rpcArgsForSearch(params));
  if (error) throw error;
  const rows = (data ?? []) as CafeSearchRow[];
  const cafes: CafeCard[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    cover_url: row.cover_image_url,
    top_tags: (row.top_tags ?? []).map(dbTagLabel),
    distance_km: row.distance_m != null ? row.distance_m / 1000 : 0,
    open_now: row.open_now ?? false,
    closes_at: row.closes_at ?? undefined,
    lng: row.lng,
    lat: row.lat,
    google_rating: row.google_rating,
  }));
  const total = rows[0]?.total_count ?? 0;
  return { cafes, total };
}

export async function searchCafesCount(
  params: Omit<SearchParams, "sort" | "limit" | "offset">,
): Promise<number> {
  const { data, error } = await supabase.rpc("cafes_search_count", {
    p_tags: filterKeysToDb(params.tags ?? []),
    p_lng: params.lng ?? null,
    p_lat: params.lat ?? null,
    p_radius_m: params.radius_m ?? 5000,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

// ===========================================================================
// Cafe Detail
// ===========================================================================

const DAY_LABEL: Record<string, string> = {
  monday: "週一",
  tuesday: "週二",
  wednesday: "週三",
  thursday: "週四",
  friday: "週五",
  saturday: "週六",
  sunday: "週日",
};

function normalizeHours(business_hours: any): Record<string, string> {
  if (!business_hours || typeof business_hours !== "object") return {};
  const out: Record<string, string> = {};
  for (const [day, val] of Object.entries(business_hours)) {
    const label = DAY_LABEL[day.toLowerCase()] ?? day;
    if (val == null) continue;
    if (typeof val === "string") {
      out[label] = val;
    } else if (Array.isArray(val)) {
      out[label] = val
        .map((seg: any) => {
          if (typeof seg === "string") return seg;
          if (seg && typeof seg === "object" && "open" in seg && "close" in seg) {
            return `${seg.open} – ${seg.close}`;
          }
          return null;
        })
        .filter(Boolean)
        .join(", ");
    } else if (typeof val === "object" && "open" in val && "close" in val) {
      out[label] = `${(val as any).open} – ${(val as any).close}`;
    }
  }
  return out;
}

function normalizePhotos(photos: any): string[] {
  if (!photos) return [];
  if (Array.isArray(photos)) {
    return photos
      .map((p: any) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") return p.url ?? p.src ?? null;
        return null;
      })
      .filter((u): u is string => typeof u === "string" && u.length > 0);
  }
  return [];
}

export async function fetchCafeDetail(id: string): Promise<CafeDetail | null> {
  const { data, error } = await supabase.rpc("cafe_detail", { p_cafe_id: id });
  if (error) throw error;
  if (!data) return null;
  const d: any = data;
  const tagsDetail: TagDetail[] = Array.isArray(d.tags) ? d.tags : [];

  // Pick top 3 by confidence for display
  const topTagKeys = [...tagsDetail]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 3)
    .map((t) => t.key);

  const tags: TagWithConfidence[] = tagsDetail.map((t) => ({
    key: t.key as PlatformTagKey,
    label: dbTagLabel(t.key),
    confidence: t.confidence ?? 0,
    evidence_count: t.evidence_count ?? 0,
  }));

  return {
    id: d.id,
    name: d.name,
    address: d.address ?? "",
    phone: d.phone ?? undefined,
    ig_url: d.instagram_url ?? undefined,
    google_url: d.google_maps_url ?? undefined,
    cover_url: d.cover_image_url ?? null,
    photos: normalizePhotos(d.photos),
    hours: normalizeHours(d.business_hours),
    ai_summary: d.summary_ai ?? undefined,
    google_rating: d.google_rating ?? null,
    business_status: d.business_status ?? null,
    lng: d.lng,
    lat: d.lat,
    open_now: false, // not provided by cafe_detail; UI may compute from hours
    distance_km: 0,
    top_tags: topTagKeys.map(dbTagLabel),
    tags,
    tags_detail: tagsDetail,
  };
}

// ===========================================================================
// Auth helpers
// ===========================================================================

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Not authenticated");
  return id;
}

// ===========================================================================
// Pockets
// ===========================================================================

export async function fetchPockets(): Promise<Pocket[]> {
  const { data, error } = await supabase
    .from("pockets")
    .select("*, pocket_items(count)")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const counts = row.pocket_items;
    let item_count = 0;
    if (Array.isArray(counts) && counts.length > 0) {
      item_count = counts[0]?.count ?? 0;
    } else if (counts && typeof counts === "object" && "count" in counts) {
      item_count = (counts as any).count ?? 0;
    }
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      emoji: row.emoji ?? null,
      sort_order: row.sort_order ?? 0,
      is_public: row.is_public ?? false,
      created_at: row.created_at,
      item_count,
    };
  });
}

export async function fetchPocketItems(pocketId: string): Promise<PocketItem[]> {
  const { data, error } = await supabase
    .from("pocket_items")
    .select(
      "id, pocket_id, cafe_id, personal_note, added_at, cafe:cafes(id, name, cover_image_url, location, google_rating)",
    )
    .eq("pocket_id", pocketId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => {
    const c = row.cafe;
    let cafe: CafeCard | undefined;
    if (c) {
      // location is a postgis point; we don't have lng/lat reliably parsed
      // here. Frontend list views currently ignore distance/open_now in
      // pocket lists per spec.
      cafe = {
        id: c.id,
        name: c.name,
        cover_url: c.cover_image_url ?? null,
        top_tags: [],
        distance_km: 0,
        open_now: false,
        lng: 0,
        lat: 0,
        google_rating: c.google_rating ?? null,
      };
    }
    return {
      id: row.id,
      pocket_id: row.pocket_id,
      cafe_id: row.cafe_id,
      personal_note: row.personal_note ?? null,
      added_at: row.added_at,
      cafe,
    };
  });
}

export async function createPocket(input: { name: string; emoji?: string | null }): Promise<Pocket> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("pockets")
    .insert({ user_id: userId, name: input.name, emoji: input.emoji ?? null })
    .select("*")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    user_id: data.user_id,
    name: data.name,
    emoji: data.emoji ?? null,
    sort_order: data.sort_order ?? 0,
    is_public: data.is_public ?? false,
    created_at: data.created_at,
    item_count: 0,
  };
}

export async function updatePocket(
  id: string,
  patch: Partial<Pick<Pocket, "name" | "emoji" | "sort_order" | "is_public">>,
): Promise<void> {
  const { error } = await supabase.from("pockets").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deletePocket(id: string): Promise<void> {
  const { error } = await supabase.from("pockets").delete().eq("id", id);
  if (error) throw error;
}

export async function addToPocket(
  pocketId: string,
  cafeId: string,
  note?: string,
): Promise<void> {
  const { error } = await supabase
    .from("pocket_items")
    .insert({ pocket_id: pocketId, cafe_id: cafeId, personal_note: note ?? null });
  if (error) throw error;
}

export async function removeFromPocket(pocketId: string, cafeId: string): Promise<void> {
  const { error } = await supabase
    .from("pocket_items")
    .delete()
    .eq("pocket_id", pocketId)
    .eq("cafe_id", cafeId);
  if (error) throw error;
}

export async function isCafeInAnyPocket(
  cafeId: string,
): Promise<{ pocketId: string; pocketName: string } | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("pocket_items")
    .select("pocket_id, pocket:pockets!inner(id, name, user_id)")
    .eq("cafe_id", cafeId)
    .eq("pocket.user_id", userId)
    .limit(1);
  if (error) throw error;
  const row: any = (data ?? [])[0];
  if (!row) return null;
  const pocket = Array.isArray(row.pocket) ? row.pocket[0] : row.pocket;
  if (!pocket) return null;
  return { pocketId: pocket.id, pocketName: pocket.name };
}

// ===========================================================================
// Tag votes
// ===========================================================================

export async function voteTag(cafeId: string, tagKey: string, vote: 1 | -1): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("tag_votes")
    .upsert(
      { cafe_id: cafeId, tag_key: tagKey, user_id: userId, vote },
      { onConflict: "cafe_id,tag_key,user_id" },
    );
  if (error) throw error;
}

export async function clearVote(cafeId: string, tagKey: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("tag_votes")
    .delete()
    .eq("cafe_id", cafeId)
    .eq("tag_key", tagKey)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function fetchUserVotes(cafeId: string): Promise<Record<string, 1 | -1>> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return {};
  const { data, error } = await supabase
    .from("tag_votes")
    .select("tag_key, vote")
    .eq("cafe_id", cafeId)
    .eq("user_id", userId);
  if (error) throw error;
  const out: Record<string, 1 | -1> = {};
  for (const row of data ?? []) {
    out[(row as any).tag_key] = (row as any).vote;
  }
  return out;
}

// ===========================================================================
// Reports & Edits
// ===========================================================================

export async function submitReport(input: {
  cafe_id: string;
  type: "closed" | "duplicate" | "wrong" | "other";
  note?: string;
}): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from("reports").insert({
    cafe_id: input.cafe_id,
    reporter_id: userId,
    type: input.type,
    note: input.note ?? null,
  });
  if (error) throw error;
}

export async function submitEdit(input: {
  cafe_id: string;
  target: string;
  before_value?: any;
  after_value: any;
  note?: string;
  source_url?: string;
}): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from("edits").insert({
    cafe_id: input.cafe_id,
    editor_id: userId,
    target: input.target,
    before_value: input.before_value ?? null,
    after_value: input.after_value,
    note: input.note ?? null,
    source_url: input.source_url ?? null,
  });
  if (error) throw error;
}

// ===========================================================================
// Profile
// ===========================================================================

export async function fetchUserStats(userId: string): Promise<UserStats> {
  const [pocketsRes, itemsRes, editsRes, votesRes] = await Promise.all([
    supabase.from("pockets").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("pocket_items")
      .select("id, pocket:pockets!inner(user_id)", { count: "exact", head: true })
      .eq("pocket.user_id", userId),
    supabase.from("edits").select("id", { count: "exact", head: true }).eq("editor_id", userId),
    supabase.from("tag_votes").select("cafe_id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  return {
    pocket_count: pocketsRes.count ?? 0,
    pocket_items_count: itemsRes.count ?? 0,
    edits_count: editsRes.count ?? 0,
    votes_count: votesRes.count ?? 0,
  };
}

export async function fetchContributions(
  userId: string,
  limit: number = 20,
): Promise<Contribution[]> {
  const [editsRes, votesRes] = await Promise.all([
    supabase
      .from("edits")
      .select("id, cafe_id, target, after_value, created_at, status, cafe:cafes(name)")
      .eq("editor_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("tag_votes")
      .select("cafe_id, tag_key, vote, created_at, cafe:cafes(name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (editsRes.error) throw editsRes.error;
  if (votesRes.error) throw votesRes.error;

  const contributions: Contribution[] = [];

  for (const row of editsRes.data ?? []) {
    const r: any = row;
    const cafe = Array.isArray(r.cafe) ? r.cafe[0] : r.cafe;
    contributions.push({
      id: `edit-${r.id}`,
      type: "edit",
      cafe_id: r.cafe_id,
      cafe_name: cafe?.name ?? "",
      detail: `編輯了 ${r.target}`,
      created_at: r.created_at,
      status: r.status ?? undefined,
    });
  }

  for (const row of votesRes.data ?? []) {
    const r: any = row;
    const cafe = Array.isArray(r.cafe) ? r.cafe[0] : r.cafe;
    contributions.push({
      id: `vote-${r.cafe_id}-${r.tag_key}-${r.created_at}`,
      type: "vote",
      cafe_id: r.cafe_id,
      cafe_name: cafe?.name ?? "",
      detail: `${r.vote > 0 ? "讚同" : "反對"} ${dbTagLabel(r.tag_key)}`,
      created_at: r.created_at,
    });
  }

  contributions.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return contributions.slice(0, limit);
}

export async function fetchUserPreferences(userId: string): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from("users")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return ((data?.preferences ?? {}) as UserPreferences) || {};
}

export async function updateUserPreferences(
  userId: string,
  prefs: Partial<UserPreferences>,
): Promise<void> {
  const current = await fetchUserPreferences(userId);
  const merged: UserPreferences = { ...current, ...prefs };
  const { error } = await supabase.from("users").update({ preferences: merged }).eq("id", userId);
  if (error) throw error;
}
