import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { PromptHero } from "./PromptHero";
import { ScenarioGrid, SCENARIO_BY_KEY, type Scenario } from "./ScenarioGrid";
import { CafeListItem } from "./CafeListItem";
import { Cap } from "@/components/primitives";
import type { CafeCard } from "@/types/cafe";

export type SortKey = "distance" | "rating";

interface SearchSidebarProps {
  activeId: string | null;
  selected: Set<string>;
  toggle: (key: string) => void;
  setAll: (keys: string[]) => void;
  query: string;
  setQuery: (v: string) => void;
  /** 目前選中的快速場景 key,null 表示未選。 */
  scenario: string | null;
  /** 場景按鈕點擊 — 父層需更新 scenario + selected。 */
  pickScenario: (s: Scenario) => void;
  cafes: CafeCard[];
  totalCount: number;
  isLoading?: boolean;
  isError?: boolean;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "distance", label: "按距離" },
  { value: "rating", label: "按評分" },
];

/** 桌面左欄 — 首頁與咖啡廳詳細頁共用,點咖啡廳時不會改版 */
export function SearchSidebar({
  activeId,
  selected,
  toggle,
  setAll,
  query,
  setQuery,
  scenario,
  pickScenario,
  cafes,
  totalCount,
  isLoading,
  isError,
  sortKey,
  onSortChange,
}: SearchSidebarProps) {
  const activeScenario = scenario ? SCENARIO_BY_KEY[scenario] : null;
  const headingText = isLoading
    ? "搜尋中…"
    : activeScenario
      ? `${totalCount} 間${activeScenario.title}`
      : `${totalCount} 間符合`;

  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? "按距離";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden border-r border-base-content/10">
      <div className="overflow-y-auto">
        <section className="px-5 pt-5">
          <PromptHero
            compact
            query={query}
            onQueryChange={setQuery}
            selected={selected}
            onToggle={toggle}
            onSubmit={(parsed) => setAll(parsed)}
          />
        </section>

        <div className="px-5 pt-5">
          <Cap>快速場景</Cap>
          <div className="mt-2">
            <ScenarioGrid layout="grid" activeKey={scenario} onPick={pickScenario} />
          </div>
        </div>

        <div className="px-5 pt-3">
          <Link
            to="/filter"
            className="btn btn-ghost btn-xs text-base-content/55 gap-1"
          >
            ⚙ 進階篩選
          </Link>
        </div>

        <div className="divider mx-5 my-3" />

        <section className="pb-6">
          <header className="flex items-baseline justify-between px-5 pb-2">
            <h3 className="text-sm font-semibold">{headingText}</h3>
            {/* 排序切換 — 仿 Topbar 頭貼的 dropdown 樣式 */}
            <div className="relative" ref={sortRef}>
              <button
                type="button"
                onClick={() => setIsSortOpen((v) => !v)}
                className="flex items-center gap-1 text-xs text-base-content/65 hover:text-base-content transition-colors px-1 py-0.5"
                aria-haspopup="listbox"
                aria-expanded={isSortOpen}
              >
                {currentSortLabel}
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={12}
                  strokeWidth={1.5}
                  className={`transition-transform duration-200 ${isSortOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isSortOpen && (
                <ul
                  role="listbox"
                  className="absolute right-0 z-50 mt-1 w-32 border border-base-content/15 bg-base-100 shadow-lg cp-anim-slide-in"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <li key={opt.value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={opt.value === sortKey}
                        onClick={() => {
                          onSortChange(opt.value);
                          setIsSortOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-base-200/60 ${
                          opt.value === sortKey ? "bg-base-200 font-semibold" : ""
                        }`}
                      >
                        {opt.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </header>
          {isError ? (
            <p className="px-5 py-6 text-center text-sm text-base-content/55">
              載入失敗，請稍後再試
            </p>
          ) : isLoading ? (
            <ul className="divide-y divide-base-content/10 border-y border-base-content/10">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="px-5 py-3">
                  <div className="h-14 bg-base-200 animate-pulse rounded" />
                </li>
              ))}
            </ul>
          ) : cafes.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-base-content/55">
              找不到符合條件的咖啡店
            </p>
          ) : (
            <ul className="divide-y divide-base-content/10 border-y border-base-content/10">
              {cafes.map((c) => (
                <li key={c.id}>
                  <CafeListItem
                    cafe={c}
                    active={c.id === activeId}
                    sortKey={sortKey}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
