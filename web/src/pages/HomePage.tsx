import { useNavigate } from "react-router-dom";
import { Topbar } from "@/components/layout/Topbar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { PromptHero } from "@/components/search/PromptHero";
import { ScenarioGrid } from "@/components/search/ScenarioGrid";
import { Cap } from "@/components/primitives";
import { useSearchSelection } from "@/hooks/useSearchSelection";

/**
 * 手機版首頁。
 * 桌面版改由 App.tsx 的 DesktopApp 統一管理(SearchSidebar + CafeMap 常駐)。
 */
export default function HomePage() {
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
      <MobileTabBar />
    </div>
  );
}
