import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Cap, CustomSelect } from "@/components/primitives";
import { FILTER_TAG_GROUPS, SORT_OPTIONS } from "@/data/filterTags";
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

/**
 * 進階篩選頁 — 手機全螢幕,多標籤交叉篩選,底部即時筆數。
 */
export default function FilterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const initialTags = params.getAll("tag");
  const initialOpenAt = params.get("open_at");
  const initialDist = Number(params.get("d") || "3");

  const [selected, setSelected] = useState<Set<string>>(new Set(initialTags));
  const [distance, setDistance] = useState(initialDist);
  const [sort, setSort] = useState("綜合");
  const [openAt, setOpenAt] = useState<string | null>(initialOpenAt);

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

  const toggle = (tag: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  const handleTimeModeChange = (mode: "any" | "now" | "specific") => {
    setTimeMode(mode);
    if (mode === "any") {
      setOpenAt(null);
    } else if (mode === "now") {
      setOpenAt(new Date().toISOString());
    } else {
      const dateStr = WEEKDAY_TO_DATE_STR[selDay];
      setOpenAt(`${dateStr}T${selHour}:00+08:00`);
    }
  };

  const handleSpecificChange = (day: string, hour: string) => {
    setSelDay(day);
    setSelHour(hour);
    const dateStr = WEEKDAY_TO_DATE_STR[day];
    setOpenAt(`${dateStr}T${hour}:00+08:00`);
  };

  const reset = () => {
    setSelected(new Set());
    setDistance(3);
    setSort("綜合");
    setTimeMode("any");
    setOpenAt(null);
  };

  const { location } = useUserLocation();

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

  const apply = () => {
    const nextParams = new URLSearchParams();
    selected.forEach((t) => nextParams.append("tag", t));
    nextParams.set("d", String(distance));
    if (openAt) {
      nextParams.set("open_at", openAt);
    }
    navigate(`/map?${nextParams.toString()}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-base-100">
      {/* Top bar */}
      <header className="navbar sticky top-0 z-30 min-h-12 border-b border-base-content/10 bg-base-100/95 px-2 backdrop-blur">
        <div className="navbar-start">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn btn-ghost btn-sm btn-square"
            aria-label="關閉"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="navbar-center">
          <h1 className="text-sm font-semibold">篩選</h1>
        </div>
        <div className="navbar-end">
          <button type="button" onClick={reset} className="btn btn-ghost btn-sm text-xs">
            重置
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-5 pb-24">
        {/* Distance */}
        <section className="pt-5">
          <Cap>距離</Cap>
          {location ? (
            <>
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
            </>
          ) : (
            <div className="mt-3 rounded border border-base-content/10 bg-base-200/50 px-4 py-3 text-center text-xs text-base-content/60">
              🔒 開啟定位後即可篩選距離
            </div>
          )}
        </section>

        <div className="divider" />

        {/* Operating Hours */}
        <section className="mb-4">
          <Cap>營業時間</Cap>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleTimeModeChange("any")}
              className={`btn btn-sm ${timeMode === "any" ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
            >
              不限時間
            </button>
            <button
              type="button"
              onClick={() => handleTimeModeChange("now")}
              className={`btn btn-sm ${timeMode === "now" ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
            >
              現在營業中
            </button>
            <button
              type="button"
              onClick={() => handleTimeModeChange("specific")}
              className={`btn btn-sm ${timeMode === "specific" ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
            >
              指定時間...
            </button>
          </div>

          {timeMode === "specific" && (
            <div className="mt-3 flex gap-2 cp-anim-fade-in">
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

        <div className="divider" />

        {/* Tag groups */}
        {FILTER_TAG_GROUPS.map((group) => (
          <section key={group.label} className="mb-4">
            <Cap>{group.label}</Cap>
            <div className="mt-2 flex flex-wrap gap-2">
              {group.tags.map((tag) => (
                <button
                  key={tag.key}
                  type="button"
                  onClick={() => toggle(tag.key)}
                  className={`btn btn-sm ${selected.has(tag.key) ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </section>
        ))}

        <div className="divider" />

        {/* Sort */}
        <section>
          <Cap>排序依據</Cap>
          <div className="mt-2 flex flex-wrap gap-2">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSort(opt)}
                className={`btn btn-sm ${sort === opt ? "btn-neutral" : "btn-ghost border border-base-content/15"}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* Sticky footer */}
      <div className="sticky bottom-0 z-20 grid grid-cols-2 gap-2 border-t border-base-content/10 bg-base-100/95 px-5 py-3 backdrop-blur">
        <button type="button" onClick={reset} className="btn btn-ghost">
          清除全部
        </button>
        <button type="button" onClick={apply} className="btn btn-neutral">
          顯示 {allCafes.isLoading ? "…" : count} 間 →
        </button>
      </div>
    </div>
  );
}
