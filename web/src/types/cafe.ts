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
  lng: number;
  lat: number;
}

export interface CafeDetail extends CafeCard {
  address: string;
  phone?: string;
  ig_url?: string;
  google_url?: string;
  hours: Record<string, string>;
  tags: TagWithConfidence[];
  ai_summary?: string;
  photos: string[];
}
