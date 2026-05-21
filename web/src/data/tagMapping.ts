/**
 * Mapping between frontend short filter keys (used by FILTER_TAG_GROUPS / chips)
 * and DB tag_key values used in the `cafe_tags` / `tag_votes` tables.
 */

export const FILTER_TO_DB: Record<string, string> = {
  socket: "socket_available",
  no_limit: "time_limit",
  study: "study_friendly",
  chat: "discussion_friendly",
  reserve: "reservable",
  group: "group_chat_friendly",
  outdoor: "outdoor_seating",
  wifi: "wifi_available",
  big_table: "large_desks",
  budget: "high_cp_value",
  parking: "parking_friendly",
};

export const DB_TO_FILTER: Record<string, string> = Object.fromEntries(
  Object.entries(FILTER_TO_DB).map(([k, v]) => [v, k]),
);

export function filterKeysToDb(keys: string[]): string[] {
  return keys.map((k) => FILTER_TO_DB[k]).filter(Boolean);
}

/** DB tag_keys → frontend short keys (drops unknown). */
export function dbKeysToFilter(dbKeys: string[]): string[] {
  return dbKeys.map((k) => DB_TO_FILTER[k]).filter(Boolean);
}

/** DB tag_key → 中文 label，用於顯示 cafe.top_tags / TagBadge */
export const DB_TAG_LABEL: Record<string, string> = {
  socket_available: "有插座",
  pet_friendly: "寵物友善",
  reservable: "可訂位",
  outdoor_seating: "戶外座",
  study_friendly: "適合讀書",
  discussion_friendly: "適合討論",
  group_chat_friendly: "適合多人",
  time_limit: "不限時",
  wifi_available: "有Wi-Fi",
  large_desks: "大桌子",
  high_cp_value: "高CP值",
  parking_friendly: "方便停車",
};

export function dbTagLabel(key: string): string {
  return DB_TAG_LABEL[key] ?? key;
}

