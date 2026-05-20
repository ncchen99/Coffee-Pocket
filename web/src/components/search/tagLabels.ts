/** Tag key → 中文 label 的對應表,搭配 search-cafes 回傳 platform_tag key 用。 */
export const TAG_LABELS: Record<string, string> = {
  no_limit: "不限時",
  socket: "有插座",
  quiet: "安靜",
  late_night: "22:00 後",
  near_3km: "3km 內",
  group_4: "4 人",
  now: "現在營業",
  reservable: "可訂位",
  pet: "寵物友善",
  outdoor: "戶外座",
  study: "適合讀書",
};

export const tagLabel = (key: string): string => TAG_LABELS[key] ?? key;
