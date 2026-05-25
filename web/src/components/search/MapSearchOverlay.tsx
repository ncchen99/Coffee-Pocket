import { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  Loading03Icon,
  ArrowLeft02Icon,
  Cancel01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { FilterChipBar, type ChipOption } from "@/components/search/FilterChipBar";
import { parsePrompt } from "@/lib/api";
import { TAG_LABEL_TO_KEY } from "@/data/filterTags";
import { searchCafesLocal } from "@/lib/cafeFilter";
import { useAllCafes } from "@/hooks/useCafes";
import { useUserLocation } from "@/context/UserLocationContext";

export type SearchMode = "idle" | "searching" | "results";

const CHIP_OPTIONS: ChipOption[] = [
  { key: "now", label: "現在營業" },
  { key: "no_limit", label: "不限時" },
  { key: "socket", label: "有插座" },
  { key: "study", label: "適合讀書" },
];

function matchTagLabelKey(q: string): string | null {
  const trimmed = q.replace(/\s+/g, "");
  if (TAG_LABEL_TO_KEY[trimmed]) return TAG_LABEL_TO_KEY[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [label, key] of Object.entries(TAG_LABEL_TO_KEY)) {
    if (label.toLowerCase() === lower) return key;
  }
  return null;
}

interface Props {
  mode: SearchMode;
  query: string;
  onQueryChange: (q: string) => void;
  selected: Set<string>;
  onToggleTag: (key: string) => void;
  onFocusSearch: () => void;
  /** 退出 searching → 回 idle 或 results；results→idle 全清。 */
  onBack: () => void;
  onClearAll: () => void;
  /** AI / keyword 解析後觸發 — 父層更新 tags / openAt / keyword 並切到 results 模式。 */
  onSubmit: (
    parsedTags: string[],
    softTags: string[],
    openAt: string | null,
    distanceKm: number | null,
    keyword: string | null,
  ) => void;
  loading?: boolean;
  setLoading?: (b: boolean) => void;
}

/**
 * Google Maps 風格的浮動搜尋層。永遠絕對定位在地圖左上,z-index 高於 sheet。
 * 三種模式:
 *   - idle:左 slot = 漢堡(個人),右 slot 無;chips 顯示。
 *   - searching:左 slot = ←;chips 顯示;父層應同時把 sheet 撐到全屏覆蓋。
 *   - results:左 slot = ←,右 slot = ✕;chips 顯示。
 */
export function MapSearchOverlay({
  mode,
  query,
  onQueryChange,
  selected,
  onToggleTag,
  onFocusSearch,
  onBack,
  onClearAll,
  onSubmit,
  loading,
  setLoading,
}: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const allCafes = useAllCafes();
  const { location } = useUserLocation();

  // searching 模式自動 focus,結束 searching 時 blur
  useEffect(() => {
    if (mode === "searching") {
      inputRef.current?.focus();
    } else {
      inputRef.current?.blur();
    }
  }, [mode]);

  const handleSubmit = async () => {
    const q = query.trim();
    if (!q) {
      onSubmit(Array.from(selected), [], null, null, null);
      return;
    }
    const labelKey = matchTagLabelKey(q);
    if (labelKey) {
      onSubmit([labelKey], [], null, null, null);
      return;
    }
    const localMatch = searchCafesLocal(allCafes.data, {
      userLng: location?.lng ?? null,
      userLat: location?.lat ?? null,
      q,
    }).length;
    if (localMatch > 0) {
      onSubmit([], [], null, null, q);
      return;
    }
    setLoading?.(true);
    try {
      const parsed = await parsePrompt(q);
      onSubmit(parsed.tags, parsed.soft_tags, parsed.open_at, parsed.distance_km, null);
    } catch (_e) {
      onSubmit([], [], null, null, null);
    } finally {
      setLoading?.(false);
    }
  };

  const leftSlot = (() => {
    if (mode === "idle") {
      return null;
    }
    return (
      <button
        type="button"
        onClick={onBack}
        className="btn btn-ghost btn-sm btn-square"
        aria-label="返回"
      >
        <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.5} />
      </button>
    );
  })();

  const rightSlot = (() => {
    if (mode === "results") {
      return (
        <button
          type="button"
          onClick={onClearAll}
          className="btn btn-ghost btn-sm btn-square"
          aria-label="清除"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
        </button>
      );
    }
    if (mode === "idle") {
      return (
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="btn btn-ghost btn-sm btn-square"
          aria-label="個人"
        >
          <HugeiconsIcon icon={UserIcon} size={18} strokeWidth={1.5} />
        </button>
      );
    }
    return null;
  })();

  return (
    <div className="pointer-events-none absolute inset-x-2 top-3 z-40 flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        onClick={() => {
          // 整條搜尋列都是 tap target — 點到 icon、左右 padding 或邊框都能進入搜尋。
          // (idle 模式下單純依賴 input onFocus 在手機上常常需要點兩次才會觸發。)
          if (mode === "idle") {
            onFocusSearch();
            inputRef.current?.focus();
          }
        }}
        className={`pointer-events-auto flex items-center gap-1 rounded-full border border-base-content/10 bg-base-100 px-2 py-1.5 transition-shadow duration-200 ${
          mode === "searching" ? "" : "shadow-lg"
        }`}
      >
        {leftSlot}
        <div className="flex flex-1 items-center gap-1.5 px-1 min-w-0">
          {mode === "idle" && (
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              strokeWidth={1.5}
              className="shrink-0 text-base-content/55"
            />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={onFocusSearch}
            placeholder={mode === "idle" ? "搜尋咖啡廳或情境" : "輸入店名 / 情境"}
            className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
            disabled={loading}
          />
          {loading && (
            <HugeiconsIcon
              icon={Loading03Icon}
              size={14}
              className="shrink-0 animate-spin text-base-content/55"
            />
          )}
        </div>
        {rightSlot}
      </form>
      <div className="pointer-events-auto overflow-x-auto no-scrollbar">
        <FilterChipBar
          options={CHIP_OPTIONS}
          selected={selected}
          onToggle={onToggleTag}
          className="flex"
          hasShadow={mode !== "searching"}
          noShadow={mode === "searching"}
        />
      </div>
    </div>
  );
}
