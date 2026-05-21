import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon, Share01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { useIsDesktop } from "@/components/layout/Responsive";
import { FilterChipBar, type ChipOption } from "@/components/search/FilterChipBar";
import { CafeListItem } from "@/components/search/CafeListItem";
import { CafeMap } from "@/components/search/CafeMap";
import { useSearchSelection } from "@/hooks/useSearchSelection";
import { useCafeSearch } from "@/hooks/useCafes";

const DEFAULT_LNG = 120.205;
const DEFAULT_LAT = 22.991;

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
  full: "calc(100vh - 96px)",
};
// 對應到 flyTo 的 padding.bottom(px) —— 把 sheet 高度視為「不可見區域」,
// Mapbox 在剩下的視窗扣掉這段後再決定中心。full 視為仍與 half 同高,避免
// 全展時 padding 大於可視高度導致定位失敗。
const SHEET_PADDING_VH: Record<SheetMode, number> = {
  peek: 0.2,
  half: 0.55,
  full: 0.55,
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
  const [vh, setVh] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const sheetPaddingPx = Math.round(vh * SHEET_PADDING_VH[sheet]);

  const searchQuery = useCafeSearch({
    tags: Array.from(selected),
    lng: DEFAULT_LNG,
    lat: DEFAULT_LAT,
    radius_m: 5000,
    sort: "distance",
    limit: 30,
  });
  const cafes = searchQuery.data?.cafes ?? [];
  const totalCount = searchQuery.data?.total ?? 0;

  if (isDesktop) {
    navigate(`/?${initial.map((t) => `tag=${t}`).join("&")}`, { replace: true });
    return null;
  }

  return (
    <div className="flex h-screen flex-col bg-base-100">
      {/* 固定 header — 與 cafe detail 設計一致 */}
      <header className="navbar sticky top-0 z-30 min-h-12 border-b border-base-content/10 bg-base-100/95 px-2 backdrop-blur">
        <div className="navbar-start">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="btn btn-ghost btn-sm btn-square"
            aria-label="返回"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="navbar-center">
          <h1 className="truncate text-sm font-semibold px-2">
            {selected.size > 0 ? `${selected.size} 個條件 · 中西區` : "中西區"}
          </h1>
        </div>
        <div className="navbar-end">
          <button type="button" aria-label="分享" className="btn btn-ghost btn-sm btn-square">
            <HugeiconsIcon icon={Share01Icon} size={18} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* chip bar — 緊貼 header 下方 */}
      <div className="flex items-center gap-1 border-b border-base-content/10 bg-base-100 px-3 py-2">
        <FilterChipBar
          options={CHIP_OPTIONS}
          selected={selected}
          onToggle={toggle}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => navigate("/filter")}
          className="btn btn-ghost btn-xs btn-square shrink-0"
          aria-label="進階篩選"
        >
          <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* 地圖區 + bottom sheet */}
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <CafeMap
            cafes={cafes}
            activeId={activeId}
            paddingBottom={sheetPaddingPx}
            onMarkerClick={(id) => {
              setActiveId(id);
              setSheet("half");
            }}
          />
        </div>

        <section
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col border-t border-base-content/10 bg-base-100 transition-[height] duration-300"
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
            <h2 className="text-[15px] font-semibold">
              {searchQuery.isLoading ? "搜尋中…" : `${totalCount} 間 · 中西區`}
            </h2>
            <span className="text-xs text-base-content/55">距離 ↓</span>
          </header>
          <div className="divider my-0" />
          {searchQuery.isError ? (
            <p className="px-5 py-6 text-center text-sm text-base-content/55">
              載入失敗，請稍後再試
            </p>
          ) : searchQuery.isLoading ? (
            <ul className="flex-1 divide-y divide-base-content/10 overflow-y-auto">
              {Array.from({ length: 4 }).map((_, i) => (
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
            <ul className="flex-1 divide-y divide-base-content/10 overflow-y-auto">
              {cafes.map((c) => (
                <li key={c.id}>
                  <CafeListItem cafe={c} active={c.id === activeId} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
