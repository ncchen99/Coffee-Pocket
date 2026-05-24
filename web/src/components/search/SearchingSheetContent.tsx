import { useState, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { Cap, CustomSelect } from "@/components/primitives";
import { ScenarioGrid, type Scenario } from "@/components/search/ScenarioGrid";
import { FILTER_TAG_GROUPS } from "@/data/filterTags";
import { useAllCafes } from "@/hooks/useCafes";
import { countCafesLocal } from "@/lib/cafeFilter";
import { useUserLocation } from "@/context/UserLocationContext";
import { getTWTimeParts } from "@/lib/format";

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

interface Props {
  selected: Set<string>;
  onToggleTag: (key: string) => void;
  openAt: string | null;
  onOpenAtChange: (val: string | null) => void;
  radiusM: number | null;
  onRadiusMChange: (v: number | null) => void;
  scenarioKey: string | null;
  onPickScenario: (s: Scenario) => void;
  /** 套用後切回 results 模式 */
  onApply: () => void;
}

/**
 * Searching 模式的 sheet 內容 — 全屏覆蓋,顯示快速場景 + 進階篩選。
 * 跟原 FilterPage 的差別:沒有自己的 header(交給 MapSearchOverlay),
 * 沒有獨立路由,所有改動即時打到父層共享 state。
 */
export function SearchingSheetContent({
  selected,
  onToggleTag,
  openAt,
  onOpenAtChange,
  radiusM,
  onRadiusMChange,
  scenarioKey,
  onPickScenario,
  onApply,
}: Props) {
  const { location } = useUserLocation();
  const distance = radiusM != null ? Math.round(radiusM / 1000) : 5;

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
    } catch (_e) {
      /* noop */
    }
  }
  const [selDay, setSelDay] = useState(initDay);
  const [selHour, setSelHour] = useState(initHour);

  const handleTimeModeChange = (mode: "any" | "now" | "specific") => {
    setTimeMode(mode);
    if (mode === "any") onOpenAtChange(null);
    else if (mode === "now") onOpenAtChange(new Date().toISOString());
    else {
      onOpenAtChange(`${WEEKDAY_TO_DATE_STR[selDay]}T${selHour}:00+08:00`);
    }
  };
  const handleSpecificChange = (day: string, hour: string) => {
    setSelDay(day);
    setSelHour(hour);
    onOpenAtChange(`${WEEKDAY_TO_DATE_STR[day]}T${hour}:00+08:00`);
  };

  const allCafes = useAllCafes();
  const tagsArr = Array.from(selected);
  const tagsKey = tagsArr.join(",");
  const count = useMemo(
    () =>
      countCafesLocal(allCafes.data, {
        tags: tagsArr,
        userLng: location?.lng ?? null,
        userLat: location?.lat ?? null,
        radiusM: distance * 1000,
        openAt,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCafes.data, tagsKey, location?.lng, location?.lat, distance, openAt],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5 pb-3">
        <section className="pt-2">
          <Cap>快速場景</Cap>
          <div className="mt-2">
            <ScenarioGrid layout="stack" activeKey={scenarioKey} onPick={onPickScenario} />
          </div>
        </section>

        <div className="divider my-3" />

        <section>
          <Cap>距離</Cap>
          {location ? (
            <>
              <input
                type="range"
                min={1}
                max={10}
                value={distance}
                onChange={(e) => onRadiusMChange(Number(e.target.value) * 1000)}
                className="range range-sm mt-3"
              />
              <div className="mt-1 flex justify-between text-[10px] text-base-content/50">
                <span>1km</span>
                <span>3km</span>
                <span>5km</span>
                <span>10km</span>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded border border-base-content/10 bg-base-200/50 px-4 py-3 text-center text-xs text-base-content/60">
              🔒 開啟定位後即可篩選距離
            </div>
          )}
        </section>

        <div className="divider my-3" />

        <section className="mb-4">
          <Cap>營業時間</Cap>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["any", "now", "specific"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleTimeModeChange(m)}
                className={`btn btn-sm ${timeMode === m ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
              >
                {m === "any" ? "不限時間" : m === "now" ? "現在營業中" : "指定時間..."}
              </button>
            ))}
          </div>
          {timeMode === "specific" && (
            <div className="cp-anim-fade-in mt-3 flex gap-2">
              <CustomSelect
                options={WEEKDAY_OPTIONS}
                value={selDay}
                onChange={(v) => handleSpecificChange(v, selHour)}
                widthClass="flex-1 max-w-[120px]"
              />
              <CustomSelect
                options={HOUR_OPTIONS.map((h) => ({ value: h, label: h }))}
                value={selHour}
                onChange={(v) => handleSpecificChange(selDay, v)}
                widthClass="flex-1"
              />
            </div>
          )}
        </section>

        <div className="divider my-3" />

        {FILTER_TAG_GROUPS.map((group) => (
          <section key={group.label} className="mb-4">
            <Cap>{group.label}</Cap>
            <div className="mt-2 flex flex-wrap gap-2">
              {group.tags.map((tag) => (
                <button
                  key={tag.key}
                  type="button"
                  onClick={() => onToggleTag(tag.key)}
                  className={`btn btn-sm ${selected.has(tag.key) ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* sticky apply 按鈕 — 不寫 sticky bottom,因為 sheet 自己會被 MobileTabBar 蓋住 */}
      <div className="border-t border-base-content/10 bg-base-100 px-5 py-3">
        <button
          type="button"
          onClick={onApply}
          className="btn btn-neutral btn-block btn-sm gap-1"
        >
          顯示 {allCafes.isLoading ? "…" : count} 間
          <HugeiconsIcon icon={ArrowRight02Icon} size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
