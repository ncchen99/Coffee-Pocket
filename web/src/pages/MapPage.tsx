import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { useIsDesktop } from "@/components/layout/Responsive";
import { FilterChipBar, type ChipOption } from "@/components/search/FilterChipBar";
import { CafeListItem } from "@/components/search/CafeListItem";
import { CafeMap } from "@/components/search/CafeMap";
import { useSearchSelection } from "@/hooks/useSearchSelection";
import { mockCafes } from "@/data/mockCafes";

const CHIP_OPTIONS: ChipOption[] = [
  { key: "now", label: "現在營業" },
  { key: "no_limit", label: "不限時" },
  { key: "socket", label: "有插座" },
  { key: "quiet", label: "安靜" },
];

type SheetMode = "peek" | "half" | "full";
const SHEET_HEIGHTS: Record<SheetMode, string> = {
  peek: "20vh",
  half: "55vh",
  full: "calc(100vh - 56px)",
};

/**
 * 桌面已在 / 首頁整合,/map 主要服務手機。
 * 為了直接連結時 desktop 也能看,desktop redirect 到首頁。
 */
export default function MapPage() {
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initial = params.getAll("tag");
  const { selected, toggle } = useSearchSelection(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetMode>("half");

  if (isDesktop) {
    // desktop:Map 與首頁整合,跳回首頁帶上 tag
    navigate(`/?${initial.map((t) => `tag=${t}`).join("&")}`, { replace: true });
    return null;
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-base-200">
      <div className="absolute inset-0">
        <CafeMap
          cafes={mockCafes}
          activeId={activeId}
          onMarkerClick={(id) => {
            setActiveId(id);
            setSheet("half");
          }}
        />
      </div>

      {/* top floating navbar */}
      <div className="absolute inset-x-3 top-3 z-10 flex flex-col gap-2">
        <div className="navbar min-h-10 border border-base-content/25 bg-base-100 px-2 py-1">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="btn btn-ghost btn-sm btn-square"
            aria-label="返回"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.5} />
          </button>
          <span className="ml-2 flex-1 truncate text-sm">
            {selected.size > 0 ? `${selected.size} 個條件` : "找咖啡廳或情境"}
          </span>
        </div>
        <div className="border border-base-content/25 bg-base-100 px-2 py-1.5">
          <FilterChipBar
            options={CHIP_OPTIONS}
            selected={selected}
            onToggle={toggle}
          />
        </div>
      </div>

      {/* bottom sheet — 純 daisyUI css 也沒適合的 component,自製但用 btn / divider */}
      <section
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col border-t border-base-content/25 bg-base-100 transition-[height] duration-300"
        style={{ height: SHEET_HEIGHTS[sheet] }}
      >
        <button
          type="button"
          onClick={() =>
            setSheet((s) => (s === "peek" ? "half" : s === "half" ? "full" : "peek"))
          }
          aria-label="切換結果面板"
          className="flex w-full justify-center py-2"
        >
          <span className="block h-1 w-9 bg-base-content/30" />
        </button>
        <header className="flex items-baseline justify-between px-5 pb-2">
          <h2 className="text-[15px] font-semibold">{mockCafes.length} 間 · 中西區</h2>
          <span className="text-xs text-base-content/55">距離 ↓</span>
        </header>
        <div className="divider my-0" />
        <ul className="flex-1 divide-y divide-base-content/10 overflow-y-auto">
          {mockCafes.map((c) => (
            <li key={c.id}>
              <CafeListItem cafe={c} active={c.id === activeId} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
