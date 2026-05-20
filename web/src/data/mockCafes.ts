import type { CafeCard, CafeDetail } from "@/types/cafe";

export const mockCafes: CafeCard[] = [
  {
    id: "wo-cafe",
    name: "窩 café",
    cover_url: null,
    top_tags: ["不限時", "有插座", "安靜"],
    distance_km: 0.6,
    open_now: true,
    closes_at: "23:00",
    lng: 120.2030,
    lat: 22.9925,
  },
  {
    id: "wood-door",
    name: "木門咖啡",
    cover_url: null,
    top_tags: ["可訂位", "大桌", "適合聊天"],
    distance_km: 1.2,
    open_now: true,
    closes_at: "22:00",
    lng: 120.2078,
    lat: 22.9890,
  },
  {
    id: "kokoni",
    name: "kokoni café",
    cover_url: null,
    top_tags: ["戶外座", "適合讀書"],
    distance_km: 1.4,
    open_now: true,
    closes_at: "21:00",
    lng: 120.2115,
    lat: 22.9940,
  },
  {
    id: "old-house",
    name: "老房子",
    cover_url: null,
    top_tags: ["安靜", "低消 100"],
    distance_km: 1.8,
    open_now: true,
    closes_at: "22:30",
    lng: 120.1985,
    lat: 22.9870,
  },
  {
    id: "paper-window",
    name: "紙窗",
    cover_url: null,
    top_tags: ["不限時", "適合工作"],
    distance_km: 2.1,
    open_now: false,
    closes_at: "20:00",
    lng: 120.2150,
    lat: 22.9960,
  },
];

export const mockCafeDetail = (id: string): CafeDetail | null => {
  const card = mockCafes.find((c) => c.id === id);
  if (!card) return null;
  return {
    ...card,
    address: "臺南市中西區 ◯◯ 路 ◯◯ 號",
    phone: "06-000-0000",
    ig_url: "https://instagram.com/",
    google_url: "https://maps.google.com/",
    hours: {
      "週一": "11:00 – 22:00",
      "週二": "11:00 – 22:00",
      "週三": "11:00 – 22:00",
      "週四": "11:00 – 22:00",
      "週五": "11:00 – 23:00",
      "週六": "10:00 – 23:00",
      "週日": "10:00 – 21:00",
    },
    tags: [
      { key: "time_limit", label: "不限時", confidence: 0.92, evidence_count: 8 },
      { key: "socket_available", label: "有插座", confidence: 0.88, evidence_count: 6 },
      { key: "study_friendly", label: "適合讀書", confidence: 0.74, evidence_count: 4 },
      { key: "discussion_friendly", label: "可討論", confidence: 0.42, evidence_count: 2 },
      { key: "reservable", label: "可訂位", confidence: 0.65, evidence_count: 3 },
    ],
    ai_summary: "偏安靜,很多人在工作。下午容易客滿,深夜時段較為悠閒。",
    photos: [],
  };
};
