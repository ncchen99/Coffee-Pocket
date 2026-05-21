import { supabase } from "./supabase";
import { pinyin } from "pinyin-pro";
import { filterKeysToDb, dbTagLabel, dbKeysToFilter } from "@/data/tagMapping";

/**
 * 將使用者輸入轉成「無聲調拼音」字串，用來和後端 `cafes.name_pinyin` 做 ILIKE
 * 比對。後端儲存格式是「空白分隔的音節 + 串接形」，所以這裡同時送兩種：
 *   "黑浮" → "hei fu" → 命中 "hei fu ka fei heifukafei"
 *   "heifu" → "heifu" → 命中同一條記錄的串接部分
 * 對純英文 / 純數字輸入，pinyin-pro 會原樣回傳。
 */
function toQueryPinyin(q: string): string | null {
  if (!q) return null;
  const syllables = pinyin(q, { toneType: "none", type: "array", nonZh: "consecutive" });
  const joined = syllables.map((s) => s.trim().toLowerCase()).filter(Boolean).join(" ");
  if (!joined) return null;
  // 若使用者輸入已是純 ASCII（沒中文），轉換結果會等於原字，避免多送一份。
  return joined;
}
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
// Semantic prompt parsing (LLM → filter tags)
// ===========================================================================

export interface ParsedPrompt {
  /** Frontend short keys for hard (AND) filters. */
  tags: string[];
  /** DB tag_keys for hard (AND) filters, as returned by the LLM. */
  db_tags: string[];
  /** Frontend short keys for soft (OR bonus) filters — affect ranking only, never exclude. */
  soft_tags: string[];
  /** DB tag_keys for soft (OR bonus) filters. */
  db_soft_tags: string[];
  rationale: string;
  open_at: string | null;
  distance_km: number | null;
}

export async function parsePrompt(query: string): Promise<ParsedPrompt> {
  const q = query.trim();
  if (!q) return { tags: [], db_tags: [], soft_tags: [], db_soft_tags: [], rationale: "", open_at: null, distance_km: null };

  const { data, error } = await supabase.functions.invoke("parse-prompt", {
    body: {
      query: q,
      current_time: new Date().toISOString()
    },
  });
  if (error) throw error;
  const dbHardTags: string[] = Array.isArray(data?.hard_tags) ? data.hard_tags :
    (Array.isArray(data?.tags) ? data.tags : []); // backward-compat
  const dbSoftTags: string[] = Array.isArray(data?.soft_tags) ? data.soft_tags : [];
  return {
    db_tags: dbHardTags,
    tags: dbKeysToFilter(dbHardTags),
    db_soft_tags: dbSoftTags,
    soft_tags: dbKeysToFilter(dbSoftTags),
    rationale: typeof data?.rationale === "string" ? data.rationale : "",
    open_at: typeof data?.open_at === "string" ? data.open_at : null,
    distance_km: typeof data?.distance_km === "number" ? data.distance_km : null,
  };
}

// ===========================================================================
// Search
// ===========================================================================

export interface SearchParams {
  tags?: string[]; // frontend short keys (e.g. "socket") — AND
  /** OR-match (任一符合即可)。用於場景組合，例如「聊天聚會」= 適合討論 OR 適合多人。 */
  tags_or?: string[];
  lng?: number | null;
  lat?: number | null;
  radius_m?: number; // default 5000
  sort?: "distance" | "rating" | "popular";
  limit?: number; // default 50
  offset?: number;
  open_at?: string | null;
  /** 關鍵字搜尋 — 對 cafe name / address 做 ILIKE 匹配。空字串視為未指定。 */
  q?: string | null;
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
  business_hours?: any;
}

function rpcArgsForSearch(params: SearchParams) {
  const orTags = filterKeysToDb(params.tags_or ?? []);
  const q = (params.q ?? "").trim();
  const qNonNull = q.length > 0 ? q : null;
  return {
    p_tags: filterKeysToDb(params.tags ?? []),
    p_lng: params.lng ?? null,
    p_lat: params.lat ?? null,
    p_radius_m: params.radius_m !== undefined ? params.radius_m : null,
    p_sort: params.sort ?? "distance",
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_open_at: params.open_at ?? null,
    p_tags_or: orTags.length > 0 ? orTags : null,
    p_q: qNonNull,
    p_q_pinyin: qNonNull ? toQueryPinyin(qNonNull) : null,
  };
}

export async function searchCafes(params: SearchParams): Promise<SearchResult> {
  const { data, error } = await supabase.rpc("cafes_search", rpcArgsForSearch(params));
  if (error) throw error;
  const rows = (data ?? []) as CafeSearchRow[];
  const cafes: CafeCard[] = rows.map((row) => {
    // 不在這裡固化 open_now —— React Query 會快取結果,如果在 fetch 時計算,
    // 過了打烊時間後列表仍會顯示「營業中」。把 business_hours 原樣帶下去,
    // 由 CafeListItem 在 render 時即時計算。
    return {
      id: row.id,
      name: row.name,
      cover_url: row.cover_image_url,
      top_tags: (row.top_tags ?? []).map(dbTagLabel),
      distance_km: row.distance_m != null ? row.distance_m / 1000 : 0,
      open_now: row.open_now ?? false,
      lng: row.lng,
      lat: row.lat,
      google_rating: row.google_rating,
      business_hours: row.business_hours ?? null,
    };
  });
  const total = rows[0]?.total_count ?? 0;
  return { cafes, total };
}

export async function searchCafesCount(
  params: Omit<SearchParams, "sort" | "limit" | "offset">,
): Promise<number> {
  const orTags = filterKeysToDb(params.tags_or ?? []);
  const q = (params.q ?? "").trim();
  const qNonNull = q.length > 0 ? q : null;
  const { data, error } = await supabase.rpc("cafes_search_count", {
    p_tags: filterKeysToDb(params.tags ?? []),
    p_lng: params.lng ?? null,
    p_lat: params.lat ?? null,
    p_radius_m: params.radius_m !== undefined ? params.radius_m : null,
    p_open_at: params.open_at ?? null,
    p_tags_or: orTags.length > 0 ? orTags : null,
    p_q: qNonNull,
    p_q_pinyin: qNonNull ? toQueryPinyin(qNonNull) : null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

// ===========================================================================
// Cafe Detail
// ===========================================================================

import { normalizeDayLabel, formatTimeRange, formatTime, isCafeOpenAt } from "./format";

function isClosedString(t: string): boolean {
  return t === "" || /^(closed|休|公休|休息|off)$/i.test(t.trim());
}

function formatHourSegment(seg: any): string | null {
  if (typeof seg === "string") {
    return isClosedString(seg) ? "公休" : formatTimeRange(seg);
  }
  if (seg && typeof seg === "object" && "open" in seg && "close" in seg) {
    return `${formatTime(String(seg.open))} – ${formatTime(String(seg.close))}`;
  }
  return null;
}

function normalizeHours(business_hours: any): Record<string, string> {
  if (!business_hours || typeof business_hours !== "object") return {};
  const out: Record<string, string> = {};
  for (const [day, val] of Object.entries(business_hours)) {
    const label = normalizeDayLabel(day);
    if (val == null) {
      out[label] = "公休";
      continue;
    }
    if (typeof val === "string") {
      out[label] = isClosedString(val) ? "公休" : formatTimeRange(val);
    } else if (Array.isArray(val)) {
      if (val.length === 0) {
        out[label] = "公休";
        continue;
      }
      const parts = val.map(formatHourSegment).filter((s): s is string => !!s);
      // 若所有段都是「公休」就只顯示一次
      const nonClosed = parts.filter((s) => s !== "公休");
      out[label] = nonClosed.length > 0 ? nonClosed.join(", ") : "公休";
    } else if (typeof val === "object" && "open" in val && "close" in val) {
      out[label] = formatHourSegment(val) ?? "公休";
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

  const twStatus = isCafeOpenAt(d.business_hours, new Date());

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
    google_review_count: d.google_review_count ?? null,
    price_level: d.price_level ?? null,
    business_status: d.business_status ?? null,
    lng: d.lng,
    lat: d.lat,
    open_now: twStatus.open_now,
    closes_at: twStatus.closes_at ?? undefined,
    opens_at: twStatus.opens_at ?? undefined,
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
  // Step 1: pocket items + cafe base info (top_tags 不是 cafes 表的欄位，不能用 join 取得)
  const { data, error } = await supabase
    .from("pocket_items")
    .select(
      "id, pocket_id, cafe_id, personal_note, added_at, cafe:cafes(id, name, address, cover_image_url, google_rating, google_review_count, price_level, business_hours, lng, lat)",
    )
    .eq("pocket_id", pocketId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];

  // Step 2: batch-fetch top tags from cafe_tags for all cafe_ids
  const cafeIds = rows.map((r: any) => r.cafe_id).filter(Boolean) as string[];
  const topTagsMap: Record<string, string[]> = {};
  if (cafeIds.length > 0) {
    const { data: tagRows, error: tagError } = await supabase
      .from("cafe_tags")
      .select("cafe_id, tag_key, confidence")
      .in("cafe_id", cafeIds)
      .or(
        "and(tag_type.eq.boolean,bool_value.eq.true),and(tag_type.eq.score,score_value.gte.50),and(tag_type.eq.structured,tag_key.eq.time_limit)"
      )
      .order("confidence", { ascending: false });
    if (!tagError && tagRows) {
      // Group by cafe_id, keep top 3 by confidence
      for (const row of tagRows as any[]) {
        const list = topTagsMap[row.cafe_id] ?? [];
        if (list.length < 3) list.push(row.tag_key);
        topTagsMap[row.cafe_id] = list;
      }
    }
  }

  return rows.map((row: any) => {
    const c = row.cafe;
    let cafe: CafeCard | undefined;
    if (c) {
      cafe = {
        id: c.id,
        name: c.name,
        cover_url: c.cover_image_url ?? null,
        top_tags: (topTagsMap[c.id] ?? []).map(dbTagLabel),
        distance_km: 0,
        open_now: false,
        lng: c.lng ?? 0,
        lat: c.lat ?? 0,
        google_rating: c.google_rating ?? null,
        google_review_count: c.google_review_count ?? null,
        price_level: c.price_level ?? null,
        address: c.address ?? null,
        business_hours: c.business_hours ?? null,
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

export async function addCafeTag(cafeId: string, tagKey: string): Promise<void> {
  await requireUserId();
  const { error: tagError } = await supabase
    .from("cafe_tags")
    .upsert({
      cafe_id: cafeId,
      tag_key: tagKey,
      tag_type: "boolean",
      bool_value: true,
      confidence: 1.0,
      locked_by_community: true,
      last_verified_at: new Date().toISOString().split("T")[0]
    }, {
      onConflict: "cafe_id,tag_key"
    });
  if (tagError) throw tagError;

  // Automatically cast a positive vote from the user who added it
  await voteTag(cafeId, tagKey, 1);
}

export async function deleteCafeTag(cafeId: string, tagKey: string): Promise<void> {
  await clearVote(cafeId, tagKey);
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
