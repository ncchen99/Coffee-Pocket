/** Tag key → 中文 label 的對應表,搭配 search-cafes 回傳 platform_tag key 用。 */
export const TAG_LABELS: Record<string, string> = {
  no_limit: "不限時",
  socket: "有插座",
  quiet: "安靜",
  late_night: "22:00 後",
  near_3km: "3km 內",
  chat: "適合討論",
  now: "現在營業",
  reservable: "可訂位",
  reserve: "可訂位",
  pet: "有店寵",
  pet_cat: "有店貓",
  pet_dog: "有店狗",
  outdoor: "戶外座",
  study: "適合讀書",
  group: "適合多人",
  wifi: "Wi-Fi",
  big_table: "大桌子",
  budget: "高 CP 值",
  parking: "好停車",
  parking_scooter: "機車好停",
  parking_car: "汽車好停",
};

export const tagLabel = (key: string): string => TAG_LABELS[key] ?? key;
