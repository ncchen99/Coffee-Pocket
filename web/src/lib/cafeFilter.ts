/**
 * 客戶端搜尋 / 篩選 / 排序。
 *
 * 取代每次條件變動都打 cafes_search RPC 的流程：冷啟動先拉一次全量
 * (cafes_all_for_search, ~200 筆)，後續所有 chip 切換 / 關鍵字輸入 / 排序
 * 都在前端 O(n) 完成，速度從 ~150ms 網路 round-trip 降到 <5ms。
 *
 * 邏輯刻意對齊 supabase/migrations/0021_fuzzy_normalized_search.sql 的
 * cafes_search，差別：
 *   - 不做 pg_trgm 相似度 fallback（200 筆內子字串就夠）
 *   - distance 用 haversine 代替 PostGIS ST_Distance（差距 <0.1%）
 */

import { pinyin } from "pinyin-pro";
import { haversineKm, isCafeOpenAt } from "./format";
import { filterKeysToDbGroups, filterKeysToDbOr, dbTagLabel } from "@/data/tagMapping";
import type { CafeCard } from "@/types/cafe";

export interface RawCafe {
  id: string;
  slug: string | null;
  name: string;
  name_pinyin: string | null;
  address: string | null;
  cover_image_url: string | null;
  lng: number;
  lat: number;
  google_rating: number | null;
  business_hours: any;
  top_tags: string[];
  tag_keys: string[];
}

/** 預先 normalize 後的 cafe，避免每次 keystroke 都重算。 */
export interface IndexedCafe extends RawCafe {
  _name_norm: string;
  _address_norm: string;
  _pinyin_norm: string;
}

/** 對齊 SQL normalize_search_text：lowercase + 移除空白與標點。 */
export function normalizeSearchText(t: string | null | undefined): string {
  if (!t) return "";
  return t.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** 把使用者輸入轉成無聲調拼音，與後端 name_pinyin 對齊。 */
export function toQueryPinyin(q: string): string {
  if (!q) return "";
  const syllables = pinyin(q, { toneType: "none", type: "array", nonZh: "consecutive" });
  return syllables.map((s) => s.trim().toLowerCase()).filter(Boolean).join(" ");
}

export function indexCafes(rows: RawCafe[]): IndexedCafe[] {
  return rows.map((r) => ({
    ...r,
    _name_norm: normalizeSearchText(r.name),
    _address_norm: normalizeSearchText(r.address),
    _pinyin_norm: normalizeSearchText(r.name_pinyin),
  }));
}

export type LocalSortKey = "smart" | "distance" | "rating";

/** 綜合分數：高評分加分，遠距離扣分。越大越前面。 */
function smartScore(rating: number | null | undefined, distanceKm: number): number {
  return (rating ?? 3.5) - 3.5 - 0.25 * distanceKm;
}

export interface LocalSearchParams {
  /** Frontend short keys (e.g. "socket")。AND 邏輯 — 全部都得命中。 */
  tags?: string[];
  /** OR-match bonus。場景組合用，任一命中即可。 */
  tagsOr?: string[];
  /** 使用者位置，用來算距離 / 套用 radius。 */
  userLng?: number | null;
  userLat?: number | null;
  /** 半徑（公尺）。null 表示不限。 */
  radiusM?: number | null;
  /** ISO-8601 字串。null 表示不限時間。 */
  openAt?: string | null;
  /** 關鍵字（店名 / 地址 / 拼音）。空字串視為未指定。 */
  q?: string | null;
  sort?: LocalSortKey;
}

interface ScoredCafe extends IndexedCafe {
  _distance_km: number; // 0 if no user location
  _hit_rank: number;    // 0 best — 對齊 SQL 排序
  _passed_q: boolean;
}

function passesTags(
  cafe: IndexedCafe,
  andGroups: string[][],
  orKeys: string[],
): boolean {
  if (andGroups.length > 0) {
    // 每個 group 是 OR（任一命中即可），groups 之間是 AND。
    for (const group of andGroups) {
      if (!group.some((k) => cafe.tag_keys.includes(k))) return false;
    }
  }
  if (orKeys.length > 0) {
    if (!orKeys.some((k) => cafe.tag_keys.includes(k))) return false;
  }
  return true;
}

function passesOpenAt(cafe: IndexedCafe, openAt: string | null | undefined): boolean {
  if (!openAt) return true;
  const date = new Date(openAt);
  if (Number.isNaN(date.getTime())) return true;
  return isCafeOpenAt(cafe.business_hours, date).open_now;
}

function passesRadius(distanceKm: number, radiusM: number | null | undefined, hasLoc: boolean): boolean {
  if (!hasLoc || radiusM == null) return true;
  return distanceKm * 1000 <= radiusM;
}

/**
 * 對齊 SQL：
 *   hit_rank 0: name normalized substring 命中原字
 *   hit_rank 1: pinyin normalized substring 命中拼音
 *   hit_rank 2: address normalized substring
 *   hit_rank 3: 不命中（在 SQL 走相似度 fallback，本地直接淘汰）
 */
function evalKeyword(
  cafe: IndexedCafe,
  qNorm: string,
  qpNorm: string,
): { hit: boolean; rank: number } {
  if (!qNorm && !qpNorm) return { hit: true, rank: 0 };
  if (qNorm && cafe._name_norm.includes(qNorm)) return { hit: true, rank: 0 };
  if (qpNorm && cafe._pinyin_norm.includes(qpNorm)) return { hit: true, rank: 1 };
  if (qNorm && cafe._address_norm.includes(qNorm)) return { hit: true, rank: 2 };
  return { hit: false, rank: 3 };
}

export function searchCafesLocal(
  index: IndexedCafe[],
  params: LocalSearchParams,
): CafeCard[] {
  const andGroups = filterKeysToDbGroups(params.tags ?? []);
  const orKeys = filterKeysToDbOr(params.tagsOr ?? []);
  const hasLoc = params.userLng != null && params.userLat != null;
  const qRaw = (params.q ?? "").trim();
  const qNorm = normalizeSearchText(qRaw);
  const qpNorm = qRaw ? normalizeSearchText(toQueryPinyin(qRaw)) : "";
  const sort = params.sort ?? "smart";

  const scored: ScoredCafe[] = [];
  for (const c of index) {
    if (!passesTags(c, andGroups, orKeys)) continue;
    if (!passesOpenAt(c, params.openAt)) continue;

    const distance_km = hasLoc
      ? haversineKm(
          { lng: params.userLng!, lat: params.userLat! },
          { lng: c.lng, lat: c.lat },
        )
      : 0;
    if (!passesRadius(distance_km, params.radiusM, hasLoc)) continue;

    const { hit, rank } = evalKeyword(c, qNorm, qpNorm);
    if (!hit) continue;

    scored.push({
      ...c,
      _distance_km: distance_km,
      _hit_rank: rank,
      _passed_q: true,
    });
  }

  scored.sort((a, b) => {
    if (a._hit_rank !== b._hit_rank) return a._hit_rank - b._hit_rank;
    if (sort === "rating") {
      const ar = a.google_rating ?? -1;
      const br = b.google_rating ?? -1;
      if (ar !== br) return br - ar;
    } else if (sort === "smart") {
      const sa = smartScore(a.google_rating, a._distance_km);
      const sb = smartScore(b.google_rating, b._distance_km);
      if (sa !== sb) return sb - sa;
    } else if (hasLoc) {
      if (a._distance_km !== b._distance_km) return a._distance_km - b._distance_km;
    }
    return a.name.localeCompare(b.name);
  });

  return scored.map(toCafeCard);
}

function toCafeCard(c: ScoredCafe): CafeCard {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    cover_url: c.cover_image_url,
    top_tags: c.top_tags.map(dbTagLabel),
    distance_km: c._distance_km,
    open_now: false, // CafeListItem 會根據 business_hours 即時算
    lng: c.lng,
    lat: c.lat,
    google_rating: c.google_rating,
    business_hours: c.business_hours,
    address: c.address,
  };
}

/** 給 FilterPage 預覽用的純計數版本。 */
export function countCafesLocal(index: IndexedCafe[], params: LocalSearchParams): number {
  // 重用 searchCafesLocal 不算最有效率，但 200 筆 O(n) 真的快，
  // 不重複實作可避免兩處邏輯漂移。
  return searchCafesLocal(index, params).length;
}
