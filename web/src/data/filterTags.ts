export interface TagDef {
  key: string;
  label: string;
}

export interface TagGroup {
  label: string;
  tags: TagDef[];
}

/**
 * 統一的篩選標籤定義 — 桌面 sidebar、進階篩選面板、手機篩選頁共用。
 * key 與 PromptHero / useSearchSelection 的 key 一致。
 *
 * v2.0：filter key 對應到的 DB tag 由 tagMapping.ts.FILTER_TO_DB 定義。
 * 例如 `socket` 同時涵蓋 socket_most / socket_few；`pet` 涵蓋
 * has_resident_cat / has_resident_dog。
 */
export const FILTER_TAG_GROUPS: TagGroup[] = [
  {
    label: "工作 / 讀書",
    tags: [
      { key: "socket", label: "有插座" },
      { key: "no_limit", label: "不限時" },
      { key: "study", label: "適合讀書" },
      { key: "wifi", label: "Wi-Fi" },
      { key: "big_table", label: "大桌子" },
    ],
  },
  {
    label: "社交",
    tags: [
      { key: "chat", label: "適合聊天" },
      { key: "reserve", label: "可訂位" },
      { key: "group", label: "適合多人" },
    ],
  },
  {
    label: "其他",
    tags: [
      { key: "budget", label: "高 CP 值" },
      { key: "outdoor", label: "戶外座" },
      { key: "pet", label: "有店寵" },
      { key: "parking", label: "好停車" },
    ],
  },
];

/** key → label 查找表 */
export const TAG_KEY_TO_LABEL: Record<string, string> = Object.fromEntries(
  FILTER_TAG_GROUPS.flatMap((g) => g.tags.map((t) => [t.key, t.label])),
);

/** label → key 查找表 */
export const TAG_LABEL_TO_KEY: Record<string, string> = Object.fromEntries(
  FILTER_TAG_GROUPS.flatMap((g) => g.tags.map((t) => [t.label, t.key])),
);

export const SORT_OPTIONS = ["綜合", "距離", "評分"];
