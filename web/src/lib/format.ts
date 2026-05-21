// 共用格式化工具：距離、時間、星期。
// 所有星期/時間相關計算固定使用臺灣時區 (Asia/Taipei, GMT+8)。

const TW_TZ = "Asia/Taipei";

/**
 * Haversine distance (km) — 給沒有 PostGIS 加持的列表(如 pocket items)client-side
 * 計算距離用,讓 distance_km 不會只顯示 0 公尺。誤差比 PostGIS 大一點,但對 UI
 * 顯示的「XX 公尺 / X.X 公里」精度而言完全夠用。
 */
export function haversineKm(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 將公里數轉為易讀字串：<1km 顯示「XX0 公尺」(四捨五入到十位)，≥1km 顯示「X.X 公里」。 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 1) {
    const meters = Math.round((km * 1000) / 10) * 10;
    return `${meters} 公尺`;
  }
  return `${km.toFixed(1)} 公里`;
}

const DAY_LABEL_FULL: Record<string, string> = {
  mon: "週一",
  monday: "週一",
  tue: "週二",
  tues: "週二",
  tuesday: "週二",
  wed: "週三",
  weds: "週三",
  wednesday: "週三",
  thu: "週四",
  thur: "週四",
  thurs: "週四",
  thursday: "週四",
  fri: "週五",
  friday: "週五",
  sat: "週六",
  saturday: "週六",
  sun: "週日",
  sunday: "週日",
};

const DAY_ORDER = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];

/** 將任意星期字串 (FRI、Mon、週一…) 標準化為「週X」格式；不認得就原樣返回。 */
export function normalizeDayLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  return DAY_LABEL_FULL[key] ?? raw;
}

/** 取得「臺灣時區的今日」對應的中文星期 (週一…週日)。 */
export function todayLabelTW(now: Date = new Date()): string {
  // Intl 在 Asia/Taipei 下回傳的 weekday 名稱：Monday, Tuesday...
  const en = new Intl.DateTimeFormat("en-US", {
    timeZone: TW_TZ,
    weekday: "long",
  }).format(now);
  return DAY_LABEL_FULL[en.toLowerCase()] ?? "";
}

/** 將 4 位數時間 (例：0900、2230) 補成「09:00」格式；其他格式原樣回傳。 */
export function formatTime(raw: string): string {
  const s = raw.trim();
  // 已經是 09:00 / 22:30 形式
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":");
    return `${h.padStart(2, "0")}:${m}`;
  }
  // 0900 / 2230 形式
  if (/^\d{4}$/.test(s)) {
    return `${s.slice(0, 2)}:${s.slice(2)}`;
  }
  return s;
}

/** 將「09:00-22:00」「0900-2200」「09:00 – 22:00」轉成「09:00 – 22:00」。 */
export function formatTimeRange(raw: string): string {
  const s = raw.trim();
  // 各種分隔符 (-, –, ~, 到) 統一處理
  const parts = s.split(/\s*[-–~]\s*|\s*到\s*/);
  if (parts.length === 2) {
    return `${formatTime(parts[0])} – ${formatTime(parts[1])}`;
  }
  return s;
}

/**
 * 將原始 price_level (例如 "$200-400"、"$$"、" 200~400 "、"NT$150-300") 正規化為
 * 緊湊顯示字串「$200–400」/「$$」。無法解析時回傳 trim 後原文，空值回 null。
 */
export function formatPriceLevel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const range = s.match(/(\d{2,5})\s*[-–~〜~到]\s*(\d{2,5})/);
  if (range) return `$${range[1]}–${range[2]}`;

  const single = s.match(/(\d{2,5})/);
  if (single) return `$${single[1]}`;

  const dollars = s.match(/^\$+$/);
  if (dollars) return dollars[0];

  return s;
}

export interface DayHours {
  /** 標準化後的中文星期 (週一…週日)。 */
  label: string;
  /** 已格式化好的時段字串；休息日為「公休」。 */
  hours: string;
  /** 是否為今日。 */
  isToday: boolean;
}

/**
 * 將 `hours: Record<dayLabel, timeRangeText>` 排序成「今日優先」的陣列。
 * 已假設輸入是 normalizeHours() 處理過的中文 label 與時間格式。
 */
export function orderHoursFromToday(
  hours: Record<string, string>,
  now: Date = new Date(),
): DayHours[] {
  if (!hours || typeof hours !== "object") return [];
  const today = todayLabelTW(now);
  const startIdx = Math.max(0, DAY_ORDER.indexOf(today));
  const ordered = [...DAY_ORDER.slice(startIdx), ...DAY_ORDER.slice(0, startIdx)];
  return ordered
    .filter((label) => label in hours)
    .map((label) => ({
      label,
      hours: hours[label],
      isToday: label === today,
    }));
}

export interface TWTimeParts {
  weekday: "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
  timeStr: string; // "HH:MM" e.g., "15:30"
  hour: number;
  minute: number;
}

/** 取得任意時間點在臺灣時區的詳細時間與星期資訊。 */
export function getTWTimeParts(date: Date = new Date()): TWTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TW_TZ,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  let weekdayVal = "";
  let hourVal = "";
  let minuteVal = "";

  for (const part of parts) {
    if (part.type === "weekday") weekdayVal = part.value.toLowerCase();
    if (part.type === "hour") hourVal = part.value;
    if (part.type === "minute") minuteVal = part.value;
  }

  if (!weekdayVal) {
    const enWeekday = new Intl.DateTimeFormat("en-US", { timeZone: TW_TZ, weekday: "long" }).format(date);
    weekdayVal = enWeekday.toLowerCase();
  }
  if (!hourVal || !minuteVal) {
    const twTime = new Date(date.toLocaleString("en-US", { timeZone: TW_TZ }));
    hourVal = String(twTime.getHours()).padStart(2, "0");
    minuteVal = String(twTime.getMinutes()).padStart(2, "0");
  }

  const hour = parseInt(hourVal, 10);
  const minute = parseInt(minuteVal, 10);
  const timeStr = `${hourVal}:${minuteVal}`;

  return {
    weekday: weekdayVal as TWTimeParts["weekday"],
    timeStr,
    hour,
    minute,
  };
}

export interface CafeOpenStatus {
  open_now: boolean;
  closes_at: string | null;
  /** 若今天稍後才開門，回傳開門時間（HH:mm）；否則 null。 */
  opens_at: string | null;
}

/** 判斷咖啡廳在指定的時間點（預設為目前臺灣時間）是否營業，並計算當前的打烊時間。 */
export function isCafeOpenAt(businessHours: any, date: Date = new Date()): CafeOpenStatus {
  if (!businessHours || typeof businessHours !== "object") {
    return { open_now: false, closes_at: null, opens_at: null };
  }

  const { weekday, hour, minute } = getTWTimeParts(date);
  const rawSlots = lookupDaySlots(businessHours, weekday);
  if (rawSlots == null) {
    return { open_now: false, closes_at: null, opens_at: null };
  }
  const slots = Array.isArray(rawSlots) ? rawSlots : [rawSlots];
  if (slots.length === 0) {
    return { open_now: false, closes_at: null, opens_at: null };
  }

  const currentMinutes = hour * 60 + minute;
  let nextOpenMin = Infinity;
  let nextOpenText: string | null = null;

  for (const slot of slots) {
    const parsed = parseSlot(slot);
    if (!parsed) continue;
    const { openMin, closeMin, closeText, openText } = parsed;

    if (closeMin > openMin) {
      if (currentMinutes >= openMin && currentMinutes < closeMin) {
        return { open_now: true, closes_at: closeText, opens_at: null };
      }
    } else {
      // 跨夜時段 (如 18:00 - 02:00)
      if (currentMinutes >= openMin || currentMinutes < closeMin) {
        return { open_now: true, closes_at: closeText, opens_at: null };
      }
    }

    if (openMin > currentMinutes && openMin < nextOpenMin) {
      nextOpenMin = openMin;
      nextOpenText = openText;
    }
  }

  return { open_now: false, closes_at: null, opens_at: nextOpenText };
}

/** 在 business_hours 物件中尋找指定星期的時段 — 容忍 monday/mon/MON/週一 等多種 key 形式。 */
function lookupDaySlots(businessHours: Record<string, any>, weekday: string): any {
  const w = weekday.toLowerCase();
  const candidates = [w, w.slice(0, 3), w.slice(0, 4), w.toUpperCase(), w.slice(0, 3).toUpperCase()];
  const zh: Record<string, string> = {
    monday: "週一",
    tuesday: "週二",
    wednesday: "週三",
    thursday: "週四",
    friday: "週五",
    saturday: "週六",
    sunday: "週日",
  };
  if (zh[w]) candidates.push(zh[w]);
  for (const k of candidates) {
    if (k in businessHours) return businessHours[k];
  }
  // 最後 fallback：對所有 key 做 normalize 比較
  for (const k of Object.keys(businessHours)) {
    if (normalizeDayLabel(k) === (zh[w] ?? "")) return businessHours[k];
  }
  return null;
}

function toMinutes(t: string): number {
  const s = t.trim();
  if (s.includes(":")) {
    const [h, m] = s.split(":");
    return parseInt(h, 10) * 60 + parseInt(m, 10);
  }
  if (s.length === 4 && /^\d+$/.test(s)) {
    return parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(2), 10);
  }
  return -1;
}

/** 將單一時段轉成 {openMin, closeMin, closeText}。支援 {open,close} 物件或 "09:00–22:00" 字串。 */
function parseSlot(
  slot: any,
): { openMin: number; closeMin: number; closeText: string; openText: string } | null {
  if (!slot) return null;
  if (typeof slot === "string") {
    const s = slot.trim();
    if (/^(closed|休|公休|休息|off)$/i.test(s)) return null;
    const parts = s.split(/\s*[-–~〜~到]\s*/);
    if (parts.length !== 2) return null;
    const openMin = toMinutes(parts[0]);
    const closeMin = toMinutes(parts[1]);
    if (openMin < 0 || closeMin < 0) return null;
    return { openMin, closeMin, closeText: formatTime(parts[1]), openText: formatTime(parts[0]) };
  }
  if (typeof slot === "object" && slot.open && slot.close) {
    const openMin = toMinutes(String(slot.open));
    const closeMin = toMinutes(String(slot.close));
    if (openMin < 0 || closeMin < 0) return null;
    return {
      openMin,
      closeMin,
      closeText: formatTime(String(slot.close)),
      openText: formatTime(String(slot.open)),
    };
  }
  return null;
}
