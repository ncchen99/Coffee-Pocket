// 對應 Phase 2.3 `search-cafes` / `cafe-detail` 預期回傳欄位。
// 跑通三頁 mock 之後,這份 type 就是和 Edge Function 對齊的 contract。

export type PlatformTagKey =
  // v2.0 boolean
  | "socket_most"
  | "socket_few"
  | "large_table_most"
  | "large_table_few"
  | "wifi_available"
  | "high_cp_value"
  | "scooter_parking_easy"
  | "car_parking_easy"
  | "has_resident_cat"
  | "has_resident_dog"
  | "reservable"
  | "outdoor_seating"
  // v2.0 score
  | "study_friendly"
  | "discussion_friendly"
  | "group_chat_friendly"
  // v2.0 structured
  | "time_limit"
  // Deprecated（DB 仍可能有歷史紀錄）
  | "socket_available"
  | "pet_friendly";

export interface TagWithConfidence {
  key: PlatformTagKey;
  label: string;
  confidence: number; // 0–1
  evidence_count: number;
}

export interface CafeCard {
  id: string;
  /** URL-friendly slug (pypinyin-derived). 若後端尚未回填則為 null,前端應 fallback 到 id。 */
  slug?: string | null;
  name: string;
  cover_url: string | null;
  top_tags: string[];
  distance_km: number;
  open_now: boolean;
  closes_at?: string; // "23:00"
  opens_at?: string; // "09:00" — 今天稍後才開門時設定
  lng: number;
  lat: number;
  google_rating?: number | null;
  /** 原始營業時間 JSON,讓列表能在 render 時即時計算營業狀態,
   *  避免 React Query 快取使顯示落後實際時間 (e.g. 剛過打烊還顯示營業中)。 */
  business_hours?: any;
  /** 以下三個欄位只在口袋名單情境下填入，其他列表為 undefined */
  address?: string | null;
  google_review_count?: number | null;
  price_level?: string | null;
}

/**
 * Detailed tag entry returned from `cafe_detail` RPC.
 * Note: we keep `tags: TagWithConfidence[]` on `CafeDetail` for backward compat
 * with existing UI components, and expose `tags_detail?: TagDetail[]` for new
 * code that needs the full structured payload (votes, structured_value, etc.).
 */
export interface TagDetail {
  key: string;
  type: "boolean" | "score" | "structured";
  bool_value: boolean | null;
  score_value: number | null;
  structured_value: Record<string, any> | null;
  confidence: number;
  evidence_count: number;
  vote_up: number;
  vote_down: number;
}

export interface CafeDetail extends CafeCard {
  address: string;
  phone?: string;
  website_url?: string;
  google_url?: string;
  hours: Record<string, string>;
  tags: TagWithConfidence[];
  tags_detail?: TagDetail[];
  ai_summary?: string;
  photos: string[];
  business_status?: string | null;
  google_review_count?: number | null;
  price_level?: string | null;
}

// ----- Pockets -----

export interface Pocket {
  id: string;
  user_id: string;
  name: string;
  emoji: string | null;
  sort_order: number;
  is_public: boolean;
  created_at: string;
  item_count?: number;
}

export interface PocketItem {
  id: string;
  pocket_id: string;
  cafe_id: string;
  personal_note: string | null;
  added_at: string;
  cafe?: CafeCard; // populated by join
}

// ----- Profile -----

export interface UserPreferences {
  theme?: "system" | "light" | "dark";
  default_distance_km?: number;
  default_view?: "map" | "list";
}

export interface UserStats {
  pocket_count: number;
  pocket_items_count: number;
  edits_count: number;
  votes_count: number;
}

export interface Contribution {
  id: string;
  type: "edit" | "vote" | "report";
  cafe_id: string;
  cafe_name: string;
  detail: string;
  created_at: string;
  status?: string;
}
