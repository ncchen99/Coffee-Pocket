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
  const { selected, toggle, setAll, query, setQuery, scenario, pickScenario } =
    useSearchSelection();

  const goSearch = (overrideTags?: string[], scenarioKey?: string | null) => {
    const params = new URLSearchParams();
    const tags = overrideTags ?? Array.from(selected);
    tags.forEach((k) => params.append("tag", k));
    if (query) params.set("q", query);
    const s = scenarioKey === undefined ? scenario : scenarioKey;
    if (s) params.set("scenario", s);
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
          onSubmit={(parsed) => {
            // LLM 解析後的 tags 直接覆蓋 selection 並導頁
            setAll(parsed);
            goSearch(parsed, null);
          }}
        />

        <div className="divider my-6" />

        <Cap>快速場景</Cap>
        <div className="mt-3">
          <ScenarioGrid
            layout="stack"
            activeKey={scenario}
            onPick={(s) => {
              pickScenario(s);
              goSearch(s.tags, s.key);
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => navigate("/filter")}
          className="btn btn-ghost btn-sm mt-4 gap-1 text-base-content/55"
        >
          ⚙ 進階篩選
        </button>

        <button
          type="button"
          onClick={() => goSearch()}
          className="btn btn-neutral btn-block mt-4"
        >
          看符合的店 →
        </button>
      </main>
      <MobileTabBar />
    </div>
  );
}
