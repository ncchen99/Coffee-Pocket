import { useRef, useEffect, useState } from "react";
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
import { TAG_KEY_TO_LABEL } from "@/data/filterTags";
import { SCENARIO_BY_KEY } from "@/components/search/ScenarioGrid";

export type SearchMode = "idle" | "searching" | "results";

const ALL_MAP_CHIPS: ChipOption[] = [
  { key: "now", label: "現在營業" },
  { key: "no_limit", label: "不限時" },
  { key: "socket", label: "有插座" },
  { key: "study", label: "適合讀書" },
  { key: "chat", label: "適合聊天" },
  { key: "pet", label: "寵物友善" },
  { key: "wifi", label: "有 Wi-Fi" },
];

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
  /** Enter / 表單送出 — 父層執行 tag-label / keyword / AI 解析並切到 results 模式。 */
  onSearchSubmit: () => void | Promise<void>;
  loading?: boolean;
  keyword?: string | null;
  scenario?: string | null;
  /** AI 情境搜尋後保留的原始輸入文字，供 results 模式顯示「使用者輸入內容」。 */
  submittedPrompt?: string | null;
}

/**
 * Google Maps 風格的浮動搜尋層。永遠絕對定位在地圖左上,z-index 高於 sheet。
 * 三種模式:
 *   - idle:左 slot = 無(或 nested icon); 右 slot = 個人頭貼; chips 顯示 4~5 個。
 *   - searching:左 slot = ←; chips 顯示 7 個; 輸入框 editable。
 *   - results:左 slot = search icon (不具 back 功能); 右 slot = ✕; chips 顯示 4~5 個; 輸入框唯讀並顯示篩選文字。
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
  onSearchSubmit,
  loading,
  keyword,
  scenario,
  submittedPrompt,
}: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // 自適應螢幕寬度量測
  const [screenWidth, setScreenWidth] = useState(() =>
    typeof window === "undefined" ? 375 : window.innerWidth
  );

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // tags 顯示數量邏輯
  const isSearchingMode = mode === "searching";
  const maxChips = isSearchingMode ? 7 : (screenWidth >= 390 ? 5 : 4);
  const displayedChips = ALL_MAP_CHIPS.slice(0, maxChips);

  // 搜尋條件顯示文字摘要
  const displayQueryText = (() => {
    if (keyword) return keyword;
    if (scenario && SCENARIO_BY_KEY[scenario]) return SCENARIO_BY_KEY[scenario].title;
    if (submittedPrompt) return submittedPrompt;
    if (selected && selected.size > 0) {
      const labels = Array.from(selected)
        .map((key) => {
          if (key === "now") return "現在營業";
          return TAG_KEY_TO_LABEL[key] || key;
        });
      return labels.join(", ");
    }
    return "已套用篩選";
  })();

  // searching 模式自動 focus,結束 searching 時 blur
  useEffect(() => {
    if (mode === "searching") {
      inputRef.current?.focus();
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
      return () => clearTimeout(t);
    } else {
      inputRef.current?.blur();
    }
  }, [mode]);

  const leftSlot = (() => {
    if (mode === "searching") {
      return (
        <button
          type="button"
          onClick={onBack}
          className="btn btn-ghost btn-sm btn-square -mr-1"
          aria-label="返回"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.5} />
        </button>
      );
    }
    // idle or results mode: search button (non-interactive)
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-square -mr-1 text-base-content/55 cursor-default pointer-events-none"
        aria-hidden="true"
      >
        <HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={1.5} />
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
          void onSearchSubmit();
        }}
        onClick={(e) => {
          // 如果點擊了清除按鈕，不要觸發 focus
          if ((e.target as HTMLElement).closest('[aria-label="清除"]')) {
            return;
          }
          // 整條搜尋列都是 tap target
          if (mode === "idle" || mode === "results") {
            onFocusSearch();
            if (mode === "idle") {
              inputRef.current?.focus();
              setTimeout(() => {
                inputRef.current?.focus();
              }, 20);
            }
          }
        }}
        className={`pointer-events-auto flex items-center gap-1 rounded-full border border-base-content/10 bg-base-100 px-2 py-1.5 transition-shadow duration-200 ${
          mode === "searching" ? "" : "shadow-lg"
        }`}
      >
        {leftSlot}
        <div className="flex flex-1 items-center gap-1.5 pl-0 pr-1 min-w-0">
          {mode === "results" ? (
            <div className="flex-1 text-sm text-base-content font-medium py-1 truncate cursor-pointer select-none">
              {displayQueryText}
            </div>
          ) : (
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
          )}
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
      <div className="pointer-events-auto overflow-x-auto no-scrollbar py-1 -my-1">
        <FilterChipBar
          options={displayedChips}
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
