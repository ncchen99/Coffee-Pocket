import { HugeiconsIcon } from "@hugeicons/react";
import {
  LaptopIcon,
  MoonIcon,
  UserMultipleIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";

export interface Scenario {
  key: string;
  title: string;
  sub: string;
  tags: string[];
  icon: typeof LaptopIcon;
}

export const SCENARIOS: Scenario[] = [
  { key: "work", title: "工作 / 讀書", sub: "插座・大桌・不限時", tags: ["socket", "no_limit"], icon: LaptopIcon },
  { key: "late", title: "深夜咖啡", sub: "22:00 後還開", tags: ["late_night"], icon: MoonIcon },
  { key: "group", title: "聊天聚會", sub: "4 人以上・可訂位", tags: ["group_4"], icon: UserMultipleIcon },
  { key: "discover", title: "今天去哪", sub: "隨機・在你附近", tags: [], icon: SparklesIcon },
];

interface ScenarioGridProps {
  onPick: (s: Scenario) => void;
  layout?: "stack" | "grid";
}

/**
 * 4 個快速場景按鈕。
 * - stack:手機用,垂直清單 + divider
 * - grid:桌面用,2x2 grid,每個是個 btn-outline 大按鈕
 */
export function ScenarioGrid({ onPick, layout = "stack" }: ScenarioGridProps) {
  if (layout === "grid") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {SCENARIOS.map((s) => (
          <ScenarioGridButton key={s.key} scenario={s} onClick={() => onPick(s)} />
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
            className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-base-200/60"
          >
            <span className="flex h-9 w-9 items-center justify-center border border-base-content/20 text-base-content/70">
              <HugeiconsIcon icon={s.icon} size={18} strokeWidth={1.5} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold">{s.title}</span>
              <span className="block text-xs text-base-content/55">{s.sub}</span>
            </span>
            <Arrow />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ScenarioGridButton({
  scenario,
  onClick,
}: {
  scenario: Scenario;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-outline btn-block h-auto min-h-0 justify-start gap-3 py-3 normal-case font-normal text-left hover:btn-neutral"
    >
      <HugeiconsIcon icon={scenario.icon} size={18} strokeWidth={1.5} className="shrink-0" />
      <span className="flex flex-col items-start leading-tight">
        <span className="text-sm font-semibold">{scenario.title}</span>
        <span className="text-[11px] text-base-content/55 font-normal">{scenario.sub}</span>
      </span>
    </button>
  );
}

function Arrow() {
  return <span className="text-base-content/40">→</span>;
}
