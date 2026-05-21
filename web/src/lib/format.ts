// 共用格式化工具：距離、時間、星期。
// 所有星期/時間相關計算固定使用臺灣時區 (Asia/Taipei, GMT+8)。

const TW_TZ = "Asia/Taipei";

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
