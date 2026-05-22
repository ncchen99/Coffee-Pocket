/**
 * Mapping between frontend short filter keys (used by FILTER_TAG_GROUPS / chips)
 * and DB tag_key values used in the `cafe_tags` / `tag_votes` tables.
 *
 * v2.0：一個 filter key 可能對應多個 DB tag_keys（例如「插座」涵蓋 socket_most 與
 * socket_few 兩個程度標籤）。AND 過濾在 client 端用 OR-within-group 處理；
 * server-side cafes_search RPC 仍是 AND-only，因此 `filterKeysToDbAnd` 會保守
 * 取「最有把握」的版本（most 變體優先），可能略掉 `_few` 級別的咖啡廳。
 */

// 一個 filter 對應到的 DB tag_keys，**第一個是最有把握的版本**（給 server-side AND 用）。
export const FILTER_TO_DB: Record<string, readonly string[]> = {
  socket: ["socket_most", "socket_few"],
  big_table: ["large_table_most", "large_table_few"],
  no_limit: ["time_limit"],
  study: ["study_friendly"],
  chat: ["discussion_friendly"],
  reserve: ["reservable"],
  group: ["group_chat_friendly"],
  outdoor: ["outdoor_seating"],
  pet_cat: ["has_resident_cat"],
  pet_dog: ["has_resident_dog"],
  // 寵物複合 filter：店貓 OR 店狗都算
  pet: ["has_resident_cat", "has_resident_dog"],
  wifi: ["wifi_available"],
  budget: ["high_cp_value"],
  parking_scooter: ["scooter_parking_easy"],
  parking_car: ["car_parking_easy"],
  // 停車複合 filter：機車好停 OR 汽車好停都算
  parking: ["scooter_parking_easy", "car_parking_easy"],
};

// 反向 mapping — 給 smart-search edge function 回傳的 db tag 轉回前端 short key。
// 同一個 db key 可能對應多個 filter（例如 has_resident_cat 同時屬於 pet_cat 與 pet），
// 這裡只挑「最具體」的那一個（不含 wildcard）。
export const DB_TO_FILTER: Record<string, string> = {
  socket_most: "socket",
  socket_few: "socket",
  large_table_most: "big_table",
  large_table_few: "big_table",
  time_limit: "no_limit",
  study_friendly: "study",
  discussion_friendly: "chat",
  reservable: "reserve",
  group_chat_friendly: "group",
  outdoor_seating: "outdoor",
  has_resident_cat: "pet_cat",
  has_resident_dog: "pet_dog",
  wifi_available: "wifi",
  high_cp_value: "budget",
  scooter_parking_easy: "parking_scooter",
  car_parking_easy: "parking_car",
};

/**
 * 給 client-side AND 過濾用：每個 filter 變成一組 OR groups。
 * 一筆 cafe 只要在「每個 group 都有任一命中」即通過。
 */
export function filterKeysToDbGroups(keys: string[]): string[][] {
  return keys
    .map((k) => Array.from(FILTER_TO_DB[k] ?? []))
    .filter((g) => g.length > 0);
}

/**
 * 給 server-side `p_tags` (AND only) 用：每個 filter 取「最有把握」的版本（陣列首位）。
 * 失去 `_few` 級別的命中，但避免一次送出不可能同時為真的組合。
 */
export function filterKeysToDbAnd(keys: string[]): string[] {
  return keys
    .map((k) => FILTER_TO_DB[k]?.[0])
    .filter((v): v is string => Boolean(v));
}

/**
 * 給 OR 場景（如 tags_or / soft_tags）用：把所有 filter 對應的 db keys 全部攤平。
 */
export function filterKeysToDbOr(keys: string[]): string[] {
  return keys.flatMap((k) => Array.from(FILTER_TO_DB[k] ?? []));
}

/**
 * Backwards-compat：舊 `filterKeysToDb`。在 AND 語境下保留向 server-side 行為一致
 * （取最具體版本）。新程式請改用上面三個明確函式。
 */
export function filterKeysToDb(keys: string[]): string[] {
  return filterKeysToDbAnd(keys);
}

/** DB tag_keys → frontend short keys（drop 重複與 unknown）。 */
export function dbKeysToFilter(dbKeys: string[]): string[] {
  const out = new Set<string>();
  for (const k of dbKeys) {
    const f = DB_TO_FILTER[k];
    if (f) out.add(f);
  }
  return [...out];
}

/** DB tag_key → 中文 label，用於顯示 cafe.top_tags / TagBadge */
export const DB_TAG_LABEL: Record<string, string> = {
  // 覆蓋率
  socket_most: "多有插座",
  socket_few: "少數插座",
  large_table_most: "多大桌",
  large_table_few: "偶有大桌",
  // 既有
  reservable: "可訂位",
  outdoor_seating: "戶外座",
  study_friendly: "適合讀書",
  discussion_friendly: "適合討論",
  group_chat_friendly: "適合多人",
  time_limit: "不限時",
  // 新增
  wifi_available: "有Wi-Fi",
  high_cp_value: "高CP值",
  scooter_parking_easy: "機車好停",
  car_parking_easy: "汽車好停",
  has_resident_cat: "有店貓",
  has_resident_dog: "有店狗",
  // Deprecated（DB 舊資料若還在）
  socket_available: "有插座",
  pet_friendly: "寵物友善",
  large_desks: "大桌子",
  parking_friendly: "方便停車",
};

export function dbTagLabel(key: string): string {
  return DB_TAG_LABEL[key] ?? key;
}
