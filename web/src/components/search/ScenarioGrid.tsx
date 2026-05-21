import { HugeiconsIcon } from "@hugeicons/react";
import {
  LaptopIcon,
  MoonIcon,
  UserMultipleIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import clsx from "@/lib/clsx";

export interface Scenario {
  key: string;
  title: string;
  sub: string;
  tags: string[];
  icon: typeof LaptopIcon;
}

export const SCENARIOS: Scenario[] = [
  // tags use frontend short keys (data/filterTags.ts) so filterKeysToDb 能正確轉換。
  { key: "work", title: "工作 / 讀書", sub: "插座・安靜・不限時", tags: ["socket", "quiet", "no_limit"], icon: LaptopIcon },
  // late_night 需要「目前開到 22:00 後」的概念,後端目前沒有 open_at 參數,
  // 暫以「不限時」approximate,讓不同場景產生不同的篩選結果。
  { key: "late", title: "深夜咖啡", sub: "晚上仍開・可久坐", tags: ["no_limit"], icon: MoonIcon },
  { key: "group", title: "聊天聚會", sub: "適合多人・可訂位", tags: ["group", "reserve"], icon: UserMultipleIcon },
  { key: "discover", title: "今天去哪", sub: "隨機・在你附近", tags: [], icon: SparklesIcon },
];

/** key → 場景設定查找(MapPage header / 列表標題用)。 */
export const SCENARIO_BY_KEY: Record<string, Scenario> = Object.fromEntries(
  SCENARIOS.map((s) => [s.key, s]),
);

interface ScenarioGridProps {
  onPick: (s: Scenario) => void;
  layout?: "stack" | "grid";
  /** 目前選中的場景 key,選中時 highlight。 */
  activeKey?: string | null;
}

/**
 * 4 個快速場景按鈕。
 * - stack:手機用,垂直清單 + divider
 * - grid:桌面用,2x2 表格式,以分隔線劃分(非卡片)以省空間
 */
export function ScenarioGrid({ onPick, layout = "stack", activeKey = null }: ScenarioGridProps) {
  if (layout === "grid") {
    return (
      <div className="grid grid-cols-2 border border-base-content/15">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onPick(s)}
            aria-pressed={s.key === activeKey}
            className={clsx(
              "flex flex-col items-start gap-1 px-3 py-3 text-left hover:bg-base-200/60",
              i % 2 === 0 && "border-r border-base-content/15",
              i < 2 && "border-b border-base-content/15",
              s.key === activeKey && "bg-base-content/10",
            )}
          >
            <HugeiconsIcon
              icon={s.icon}
              size={16}
              strokeWidth={1.5}
              className="text-base-content/65"
            />
            <span className="mt-0.5 text-[13px] font-semibold leading-tight">{s.title}</span>
            <span className="text-[11px] text-base-content/55 leading-tight">{s.sub}</span>
          </button>
        ))}
      </div>
    );
  }

  // stack — mobile
  return (
    <ul className="border-y border-base-content/15 divide-y divide-base-content/10">
      {SCENARIOS.map((s) => (
        <li key={s.key}>
          <button
            type="button"
            onClick={() => onPick(s)}
            aria-pressed={s.key === activeKey}
            className={clsx(
              "flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-base-200/60",
              s.key === activeKey && "bg-base-content/10",
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center border border-base-content/20 text-base-content/70">
              <HugeiconsIcon icon={s.icon} size={18} strokeWidth={1.5} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold">{s.title}</span>
              <span className="block text-xs text-base-content/55">{s.sub}</span>
            </span>
            <span className="text-base-content/40">→</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
