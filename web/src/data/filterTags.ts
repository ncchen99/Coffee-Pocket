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
 */
export const FILTER_TAG_GROUPS: TagGroup[] = [
  {
    label: "工作 / 讀書",
    tags: [
      { key: "socket", label: "有插座" },
      { key: "no_limit", label: "不限時" },
      { key: "study", label: "適合讀書" },
      { key: "wifi", label: "Wi-Fi" },
      { key: "big_table", label: "大桌面" },
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
      { key: "budget", label: "低消友善" },
      { key: "outdoor", label: "戶外座" },
      { key: "parking", label: "停車方便" },
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

export const SORT_OPTIONS = ["距離", "評分", "熱門"];
