import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon, Loading03Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { Cap } from "@/components/primitives";
import { ScenarioGrid, type Scenario } from "@/components/search/ScenarioGrid";
import { CafeListItem } from "@/components/search/CafeListItem";
import { TAG_KEY_TO_LABEL } from "@/data/filterTags";
import type { CafeCard } from "@/types/cafe";
import type { LocalSortKey } from "@/lib/cafeFilter";

interface Props {
  selected: Set<string>;
  scenarioKey: string | null;
  onPickScenario: (s: Scenario) => void;
  /** 套用後切回 results 模式 */
  onApply: () => void;
  /** 觸發 AI 情境搜尋（與 Enter 鍵走同一條路徑） */
  onPromptSearch: () => void | Promise<void>;
  loading?: boolean;
  /** AI 解析後仍然沒有任何標籤命中 — 顯示「找不到符合的咖啡廳」。 */
  exhausted?: boolean;
  query: string;
  cafes: CafeCard[];
  sortKey: LocalSortKey;
}

/**
 * Searching 模式的 sheet 內容 — 全屏覆蓋，只顯示快速場景與即時搜尋結果。
 * 進階篩選被移出到獨立的全屏 Filter 頁面。
 */
export function SearchingSheetContent({
  selected,
  scenarioKey,
  onPickScenario,
  onApply,
  onPromptSearch,
  loading,
  exhausted,
  query,
  cafes,
  sortKey,
}: Props) {
  const navigate = useNavigate();
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery !== "";
  const hasActiveFilters = selected.size > 0 || hasQuery;
  const showScenarioPrompt = hasQuery && cafes.length === 0 && !loading && !exhausted;

  // 已套用的標籤 label（給底部 apply 按鈕顯示）
  const selectedLabels = Array.from(selected)
    .filter((k) => k !== "now")
    .map((k) => TAG_KEY_TO_LABEL[k] || k);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <section className="flex flex-col items-center justify-center gap-3 py-16 text-base-content/65">
            <HugeiconsIcon
              icon={Loading03Icon}
              size={24}
              className="animate-spin text-base-content/55"
            />
            <p className="text-sm">情境搜尋中…</p>
          </section>
        ) : hasActiveFilters ? (
          <section className="pt-2">
            {cafes.length === 0 ? (
              <div className="px-2">
                {!showScenarioPrompt && (
                  <p className="py-4 text-center text-sm text-base-content/55">
                    找不到符合的咖啡廳
                  </p>
                )}
                {showScenarioPrompt && (
                  <button
                    type="button"
                    onClick={() => void onPromptSearch()}
                    className="mt-1 flex w-full items-center gap-3 rounded-2xl border border-base-content/10 bg-base-200/50 px-4 py-3 text-left transition-colors hover:bg-base-200"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <HugeiconsIcon icon={SparklesIcon} size={18} strokeWidth={1.5} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-base-content">
                        使用情境搜尋
                      </span>
                      <span className="block text-xs text-base-content/60 truncate">
                        以「{trimmedQuery}」找出符合情境的咖啡廳
                      </span>
                    </span>
                    <HugeiconsIcon
                      icon={ArrowRight02Icon}
                      size={16}
                      strokeWidth={1.5}
                      className="shrink-0 text-base-content/55"
                    />
                  </button>
                )}
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-base-content/10 w-full">
                {cafes.map((c) => (
                  <li key={c.id}>
                    <CafeListItem cafe={c} sortKey={sortKey} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="pt-2">
            <div className="px-2">
              <Cap>快速場景</Cap>
            </div>
            <div className="mt-2">
              <ScenarioGrid layout="stack" activeKey={scenarioKey} onPick={onPickScenario} />
            </div>
          </section>
        )}

        {/* 進階篩選按鈕 */}
        {!loading && (
          <div className="mt-4 mb-2 flex justify-center px-2">
            <button
              type="button"
              onClick={() => navigate("/filter")}
              className="btn btn-ghost btn-sm text-base-content/65 gap-1.5 w-full max-w-[200px] font-medium"
            >
              進階篩選
              <HugeiconsIcon
                icon={ArrowRight02Icon}
                size={14}
                strokeWidth={1.5}
                className="text-base-content/60"
              />
            </button>
          </div>
        )}
      </div>

      {/* sticky apply 按鈕 — 顯示套用的標籤與符合數量。
          注意：手機鍵盤跳出時這個按鈕會被遮住，主要的搜尋觸發路徑是 Enter 鍵。 */}
      <div
        className="border-t border-base-content/10 bg-base-100 px-5 pt-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onApply}
          disabled={loading}
          className="btn btn-neutral btn-block btn-sm gap-1.5 h-auto min-h-[2rem] py-1.5 flex-wrap"
        >
          {selectedLabels.length > 0 && (
            <span className="flex flex-wrap items-center justify-center gap-1">
              {selectedLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-neutral-content/20 px-2 py-0.5 text-[11px] font-medium leading-tight"
                >
                  #{label}
                </span>
              ))}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            顯示 {cafes.length} 間
            <HugeiconsIcon icon={ArrowRight02Icon} size={14} strokeWidth={1.5} />
          </span>
        </button>
      </div>
    </div>
  );
}
