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
  /** AND — 全部必須符合 */
  tags: string[];
  /** OR — 任一符合即可（前端 short key） */
  tagsOr?: string[];
  /** 場景觸發的時間點 (ISO-8601)。null = 不套用時間篩選。 */
  resolveOpenAt?: () => string | null;
  icon: typeof LaptopIcon;
}

function todayAt20(): string {
  // 以臺灣時區 (UTC+8) 為基準，取「今天 20:00」
  const now = new Date();
  const taipei = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = taipei.getFullYear();
  const m = String(taipei.getMonth() + 1).padStart(2, "0");
  const d = String(taipei.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T20:00:00+08:00`;
}

export const SCENARIOS: Scenario[] = [
  { key: "work", title: "工作 / 讀書", sub: "插座・讀書・不限時", tags: ["socket", "study", "no_limit"], icon: LaptopIcon },
  // 深夜咖啡 — 晚上 8 點後仍營業
  {
    key: "late",
    title: "深夜咖啡",
    sub: "晚上 8 點後仍開",
    tags: [],
    resolveOpenAt: todayAt20,
    icon: MoonIcon,
  },
  // 聊天聚會 — 適合討論 OR 適合多人，並且不限時
  {
    key: "group",
    title: "聊天聚會",
    sub: "適合討論／多人・不限時",
    tags: ["no_limit"],
    tagsOr: ["chat", "group"],
    icon: UserMultipleIcon,
  },
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
