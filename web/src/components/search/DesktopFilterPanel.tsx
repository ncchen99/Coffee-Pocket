import { useState } from "react";
import { Cap } from "@/components/primitives";
import { FILTER_TAG_GROUPS, SORT_OPTIONS } from "@/data/filterTags";
import { useCafeSearchCount } from "@/hooks/useCafes";
import { getTWTimeParts } from "@/lib/format";

const DEFAULT_LNG = 120.205;
const DEFAULT_LAT = 22.991;

interface DesktopFilterPanelProps {
  selected: Set<string>;
  onToggle: (key: string) => void;
  onReset: () => void;
  onApply?: () => void;
  onClose?: () => void;
  openAt: string | null;
  onOpenAtChange: (val: string | null) => void;
}

const WEEKDAY_TO_DATE_STR: Record<string, string> = {
  monday: "2026-05-18",
  tuesday: "2026-05-19",
  wednesday: "2026-05-20",
  thursday: "2026-05-21",
  friday: "2026-05-22",
  saturday: "2026-05-23",
  sunday: "2026-05-24",
};

const WEEKDAY_OPTIONS = [
  { value: "monday", label: "週一" },
  { value: "tuesday", label: "週二" },
  { value: "wednesday", label: "週三" },
  { value: "thursday", label: "週四" },
  { value: "friday", label: "週五" },
  { value: "saturday", label: "週六" },
  { value: "sunday", label: "週日" },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const h = String(i).padStart(2, "0");
  return `${h}:00`;
});

/**
 * 桌面版進階篩選面板 — 嵌入在 detail column 中,取代咖啡廳詳細資訊。
 * selected / onToggle / onReset 來自父層 DesktopApp,與 SearchSidebar 共享。
 */
export function DesktopFilterPanel({
  selected,
  onToggle,
  onReset,
  onApply,
  onClose,
  openAt,
  onOpenAtChange,
}: DesktopFilterPanelProps) {
  const [distance, setDistance] = useState(3);
  const [sort, setSort] = useState("距離");

  // 初始化時間模式與選定時間
  const initialMode = !openAt
    ? "any"
    : openAt.startsWith("2026-05-")
    ? "specific"
    : "now";

  const [timeMode, setTimeMode] = useState<"any" | "now" | "specific">(initialMode);

  let initDay = "monday";
  let initHour = "12:00";
  if (openAt && openAt.startsWith("2026-05-")) {
    try {
      const parts = getTWTimeParts(new Date(openAt));
      initDay = parts.weekday;
      initHour = `${String(parts.hour).padStart(2, "0")}:00`;
    } catch (e) {
      // fallback
    }
  }

  const [selDay, setSelDay] = useState(initDay);
  const [selHour, setSelHour] = useState(initHour);

  const resetAll = () => {
    onReset();
    setDistance(3);
    setSort("距離");
    setTimeMode("any");
  };

  const handleTimeModeChange = (mode: "any" | "now" | "specific") => {
    setTimeMode(mode);
    if (mode === "any") {
      onOpenAtChange(null);
    } else if (mode === "now") {
      onOpenAtChange(new Date().toISOString());
    } else {
      const dateStr = WEEKDAY_TO_DATE_STR[selDay];
      onOpenAtChange(`${dateStr}T${selHour}:00+08:00`);
    }
  };

  const handleSpecificChange = (day: string, hour: string) => {
    setSelDay(day);
    setSelHour(hour);
    const dateStr = WEEKDAY_TO_DATE_STR[day];
    onOpenAtChange(`${dateStr}T${hour}:00+08:00`);
  };

  const countQuery = useCafeSearchCount({
    tags: Array.from(selected),
    lng: DEFAULT_LNG,
    lat: DEFAULT_LAT,
    radius_m: distance * 1000,
    open_at: openAt,
  });
  const count = countQuery.data ?? 0;

  return (
    <div className="flex h-full flex-col bg-base-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-base-content/10 px-5 py-3">
        <h2 className="text-sm font-semibold">進階篩選</h2>
        <div className="flex gap-1">
          <button type="button" onClick={resetAll} className="btn btn-ghost btn-xs">
            重置
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="btn btn-ghost btn-xs">
              ✕
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {/* Distance */}
        <section className="pt-4">
          <Cap>距離</Cap>
          <input
            type="range"
            min={1}
            max={10}
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value))}
            className="range range-sm mt-3"
          />
          <div className="mt-1 flex justify-between text-[10px] text-base-content/50">
            <span>1km</span>
            <span>3km</span>
            <span>5km</span>
            <span>10km</span>
          </div>
        </section>

        <div className="divider my-3" />

        {/* Operating Hours */}
        <section className="mb-4">
          <Cap>營業時間</Cap>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleTimeModeChange("any")}
              className={`btn btn-xs ${timeMode === "any" ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
            >
              不限時間
            </button>
            <button
              type="button"
              onClick={() => handleTimeModeChange("now")}
              className={`btn btn-xs ${timeMode === "now" ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
            >
              現在營業中
            </button>
            <button
              type="button"
              onClick={() => handleTimeModeChange("specific")}
              className={`btn btn-xs ${timeMode === "specific" ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
            >
              指定時間...
            </button>
          </div>

          {timeMode === "specific" && (
            <div className="mt-3 flex gap-2 rounded-lg bg-base-200 p-2.5 cp-anim-fade-in">
              <select
                value={selDay}
                onChange={(e) => handleSpecificChange(e.target.value, selHour)}
                className="select select-bordered select-xs flex-1 max-w-[120px] bg-base-100 font-semibold"
              >
                {WEEKDAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={selHour}
                onChange={(e) => handleSpecificChange(selDay, e.target.value)}
                className="select select-bordered select-xs flex-1 bg-base-100 font-semibold"
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        <div className="divider my-3" />

        {/* Tag groups */}
        {FILTER_TAG_GROUPS.map((group) => (
          <section key={group.label} className="mb-4">
            <Cap>{group.label}</Cap>
            <div className="mt-2 flex flex-wrap gap-2">
              {group.tags.map((tag) => (
                <button
                  key={tag.key}
                  type="button"
                  onClick={() => onToggle(tag.key)}
                  className={`btn btn-xs ${selected.has(tag.key) ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </section>
        ))}

        <div className="divider my-3" />

        {/* Sort */}
        <section>
          <Cap>排序依據</Cap>
          <div className="mt-2 flex flex-wrap gap-2">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSort(opt)}
                className={`btn btn-xs ${sort === opt ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="border-t border-base-content/10 px-5 py-3">
        <button
          type="button"
          onClick={() => onApply?.()}
          className="btn btn-neutral btn-sm btn-block"
        >
          顯示 {countQuery.isLoading ? "…" : count} 間 →
        </button>
      </div>
    </div>
  );
}
