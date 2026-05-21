// 對應 Phase 2.3 `search-cafes` / `cafe-detail` 預期回傳欄位。
// 跑通三頁 mock 之後,這份 type 就是和 Edge Function 對齊的 contract。

export type PlatformTagKey =
  | "socket_available"
  | "pet_friendly"
  | "reservable"
  | "outdoor_seating"
  | "study_friendly"
  | "discussion_friendly"
  | "group_chat_friendly"
  | "time_limit";

export interface TagWithConfidence {
  key: PlatformTagKey;
  label: string;
  confidence: number; // 0–1
  evidence_count: number;
}

export interface CafeCard {
  id: string;
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
  ig_url?: string;
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
