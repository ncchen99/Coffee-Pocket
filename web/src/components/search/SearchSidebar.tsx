import { Link } from "react-router-dom";
import { PromptHero } from "./PromptHero";
import { ScenarioGrid } from "./ScenarioGrid";
import { CafeListItem } from "./CafeListItem";
import { Cap } from "@/components/primitives";
import type { CafeCard } from "@/types/cafe";

interface SearchSidebarProps {
  activeId: string | null;
  selected: Set<string>;
  toggle: (key: string) => void;
  setAll: (keys: string[]) => void;
  query: string;
  setQuery: (v: string) => void;
  cafes: CafeCard[];
  totalCount: number;
  isLoading?: boolean;
  isError?: boolean;
}

/** 桌面左欄 — 首頁與咖啡廳詳細頁共用,點咖啡廳時不會改版 */
export function SearchSidebar({
  activeId,
  selected,
  toggle,
  setAll,
  query,
  setQuery,
  cafes,
  totalCount,
  isLoading,
  isError,
}: SearchSidebarProps) {

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
            onSubmit={() => {/* refetch */}}
          />
        </section>

        <div className="px-5 pt-5">
          <Cap>快速場景</Cap>
          <div className="mt-2">
            <ScenarioGrid layout="grid" onPick={(s) => setAll(s.tags)} />
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
            <h3 className="text-sm font-semibold">
              {isLoading ? "搜尋中…" : `${totalCount} 間符合`}
            </h3>
            <span className="text-xs text-base-content/55">距離 ↓</span>
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
              {cafes.map((c, i) => (
                <li key={c.id}>
                  <CafeListItem
                    cafe={c}
                    index={i + 1}
                    active={c.id === activeId}
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
