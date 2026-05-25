import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { Cap } from "@/components/primitives";
import { ScenarioGrid, type Scenario } from "@/components/search/ScenarioGrid";
import { CafeListItem } from "@/components/search/CafeListItem";
import type { CafeCard } from "@/types/cafe";
import type { LocalSortKey } from "@/lib/cafeFilter";

interface Props {
  selected: Set<string>;
  scenarioKey: string | null;
  onPickScenario: (s: Scenario) => void;
  /** 套用後切回 results 模式 */
  onApply: () => void;
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
  query,
  cafes,
  sortKey,
}: Props) {
  const navigate = useNavigate();
  const hasActiveFilters = selected.size > 0 || query.trim() !== "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {hasActiveFilters ? (
          <section className="pt-2">
            {cafes.length === 0 ? (
              <p className="py-6 text-center text-sm text-base-content/55">
                找不到符合條件的咖啡店
              </p>
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
      </div>

      {/* sticky apply 按鈕 */}
      <div className="border-t border-base-content/10 bg-base-100 px-5 py-3">
        <button
          type="button"
          onClick={onApply}
          className="btn btn-neutral btn-block btn-sm gap-1"
        >
          顯示 {cafes.length} 間
          <HugeiconsIcon icon={ArrowRight02Icon} size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
