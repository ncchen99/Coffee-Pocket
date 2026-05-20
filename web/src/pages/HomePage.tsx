import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Topbar } from "@/components/layout/Topbar";
import { useIsDesktop } from "@/components/layout/Responsive";
import { PromptHero } from "@/components/search/PromptHero";
import { ScenarioGrid, type Scenario } from "@/components/search/ScenarioGrid";
import { FilterChipBar, type ChipOption } from "@/components/search/FilterChipBar";
import { CafeListItem } from "@/components/search/CafeListItem";
import { CafeMap } from "@/components/search/CafeMap";
import { Cap } from "@/components/primitives";
import { useSearchSelection } from "@/hooks/useSearchSelection";
import { mockCafes } from "@/data/mockCafes";

const CHIP_OPTIONS: ChipOption[] = [
  { key: "now", label: "現在營業" },
  { key: "no_limit", label: "不限時" },
  { key: "socket", label: "有插座" },
  { key: "quiet", label: "安靜" },
  { key: "reservable", label: "可訂位" },
];

export default function HomePage() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopHome /> : <MobileHome />;
}

// ──────────────────────────────────────────────
// Mobile · hero + scenarios → 點下去跳 /map
// ──────────────────────────────────────────────
function MobileHome() {
  const navigate = useNavigate();
  const { selected, toggle, setAll, query, setQuery } = useSearchSelection([
    "no_limit",
    "socket",
  ]);

  const goSearch = (overrideTags?: string[]) => {
    const params = new URLSearchParams();
    const tags = overrideTags ?? Array.from(selected);
    tags.forEach((k) => params.append("tag", k));
    if (query) params.set("q", query);
    navigate(`/map?${params.toString()}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-base-100">
      <Topbar variant="mobile" />
      <main className="flex-1 px-5 pt-6 pb-10">
        <PromptHero
          query={query}
          onQueryChange={setQuery}
          selected={selected}
          onToggle={toggle}
          onSubmit={() => goSearch()}
        />

        <div className="divider my-6" />

        <Cap>快速場景</Cap>
        <div className="mt-3">
          <ScenarioGrid
            layout="stack"
            onPick={(s) => {
              setAll(s.tags);
              goSearch(s.tags);
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => goSearch()}
          className="btn btn-neutral btn-block mt-6"
        >
          看符合的店 →
        </button>
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────
// Desktop · Airbnb 風 split,首頁 + 結果整合
// ──────────────────────────────────────────────
function DesktopHome() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const { selected, toggle, setAll, query, setQuery } = useSearchSelection([
    "no_limit",
    "socket",
  ]);

  const handleScenarioPick = (s: Scenario) => {
    setAll(s.tags);
    // 桌面不跳轉,結果直接在右邊更新(目前是 mock,日後接 search-cafes)
  };

  return (
    <div className="flex h-screen flex-col bg-base-100">
      <Topbar
        variant="desktop"
        searchValue={query}
        onSearchChange={setQuery}
        onSubmit={() => {/* trigger refetch */}}
      />

      {/* filter chip 條 */}
      <div className="border-b border-base-content/15 px-6 py-2">
        <FilterChipBar
          options={CHIP_OPTIONS}
          selected={selected}
          onToggle={toggle}
          resultCount={mockCafes.length}
          sortLabel="距離"
        />
      </div>

      {/* 主體 split */}
      <div className="grid flex-1 grid-cols-[minmax(480px,38%)_1fr] overflow-hidden">
        {/* 左:hero + scenarios + 結果列表(同一個欄位卷) */}
        <aside className="flex flex-col overflow-hidden border-r border-base-content/15">
          <div className="overflow-y-auto">
            <section className="px-6 pt-6">
              <PromptHero
                compact
                query={query}
                onQueryChange={setQuery}
                selected={selected}
                onToggle={toggle}
                onSubmit={() => {/* refetch */}}
              />
            </section>

            <div className="px-6 pt-6">
              <Cap>快速場景</Cap>
              <div className="mt-3">
                <ScenarioGrid layout="grid" onPick={handleScenarioPick} />
              </div>
            </div>

            <div className="divider mx-6 my-4" />

            <section className="pb-8">
              <header className="flex items-baseline justify-between px-6 pb-2">
                <h3 className="text-base font-semibold">
                  {mockCafes.length} 間符合
                </h3>
                <span className="text-xs text-base-content/55">排序:距離 ↓</span>
              </header>
              <ul className="divide-y divide-base-content/10 border-y border-base-content/15">
                {mockCafes.map((c, i) => (
                  <li key={c.id}>
                    <CafeListItem
                      cafe={c}
                      index={i + 1}
                      active={c.id === activeId}
                      size="lg"
                      onHover={setActiveId}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </aside>

        {/* 右:地圖佔滿 */}
        <section className="relative overflow-hidden">
          <CafeMap
            cafes={mockCafes}
            activeId={activeId}
            onMarkerClick={setActiveId}
          />
        </section>
      </div>
    </div>
  );
}
