import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon, Share01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { useIsDesktop } from "@/components/layout/Responsive";
import { FilterChipBar, type ChipOption } from "@/components/search/FilterChipBar";
import { CafeListItem } from "@/components/search/CafeListItem";
import { CafeMap } from "@/components/search/CafeMap";
import { SCENARIO_BY_KEY } from "@/components/search/ScenarioGrid";
import { useSearchSelection } from "@/hooks/useSearchSelection";
import { useCafeSearch } from "@/hooks/useCafes";
import { usePocketItems, usePockets } from "@/hooks/usePockets";
import { useUserLocation } from "@/context/UserLocationContext";
import { getTWTimeParts, haversineKm } from "@/lib/format";
const CHIP_OPTIONS: ChipOption[] = [
  { key: "now", label: "現在營業" },
  { key: "no_limit", label: "不限時" },
  { key: "socket", label: "有插座" },
  { key: "study", label: "適合讀書" },
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
  const initialScenario = params.get("scenario");
  const initialOpenAt = params.get("open_at");
  const initialD = params.get("d");
  const initialRadiusM = initialD != null ? Number(initialD) * 1000 : null;
  const initialKeyword = params.get("q");
  const pocketId = params.get("pocket");
  const { selected, orSelected, toggle, scenario, pickScenario, openAt, setOpenAt, radiusM, keyword } =
    useSearchSelection(initial, initialRadiusM, initialKeyword);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetMode>("half");
  const [vh, setVh] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  const listRef = useRef<HTMLUListElement>(null);

  // 啟動時根據 URL ?scenario= 還原場景模式 (僅執行一次)
  useEffect(() => {
    if (initialScenario && SCENARIO_BY_KEY[initialScenario]) {
      pickScenario(SCENARIO_BY_KEY[initialScenario]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialOpenAt) {
      setOpenAt(initialOpenAt);
    }
  }, [initialOpenAt, setOpenAt]);

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const { location } = useUserLocation();
  const sheetPaddingPx = Math.round(vh * SHEET_PADDING_VH[sheet]);

  const searchQuery = useCafeSearch({
    tags: Array.from(selected),
    tags_or: orSelected,
    lng: location?.lng ?? null,
    lat: location?.lat ?? null,
    radius_m: radiusM ?? undefined,
    sort: location ? "distance" : undefined,
    limit: 1000,
    open_at: openAt,
    q: keyword,
  });
  // Pocket 模式 —— 從 /pocket 點「在地圖上看這個口袋」進來。直接以 pocket items
  // 取代 search 結果,並把鏡頭收進這批點(由 CafeMap 的 fitToCafesKey 觸發)。
  const pocketItemsQuery = usePocketItems(pocketId);
  const { data: pockets } = usePockets();
  const isPocketMode = !!pocketId;
  const pocketCafes = (pocketItemsQuery.data ?? [])
    .map((item) => item.cafe)
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) =>
      // pocket items 沒帶 PostGIS 距離欄位,但卡片上仍會顯示「距離 ↓」。用 user
      // location 在 client 端 haversine 補上,沒定位時就維持 0(顯示 "0 公尺",
      // 列表照樣可用,只是少了排序意義)。
      location
        ? { ...c, distance_km: haversineKm(location, { lng: c.lng, lat: c.lat }) }
        : c,
    )
    .sort((a, b) => (location ? a.distance_km - b.distance_km : 0));
  const cafes = isPocketMode ? pocketCafes : (searchQuery.data?.cafes ?? []);
  const totalCount = isPocketMode ? pocketCafes.length : (searchQuery.data?.total ?? 0);
  const activePocket = pockets?.find((p) => p.id === pocketId) ?? null;
  const activeScenario = scenario ? SCENARIO_BY_KEY[scenario] : null;

  // 點圖標 → 自動把對應 list item 捲到可視區域,讓使用者馬上看到項目細節。
  useEffect(() => {
    if (!activeId) return;
    const li = listRef.current?.querySelector<HTMLElement>(
      `[data-cafe-id="${activeId}"]`,
    );
    if (li) {
      li.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeId, cafes]);

  if (isDesktop) {
    const p = new URLSearchParams();
    initial.forEach((t) => p.append("tag", t));
    if (initialOpenAt) p.set("open_at", initialOpenAt);
    navigate(`/?${p.toString()}`, { replace: true });
    return null;
  }

  function formatOpenAtLabel(openAt: string | null): string {
    if (!openAt) return "";
    if (!openAt.startsWith("2026-05-")) return "現在營業中";
    try {
      const parts = getTWTimeParts(new Date(openAt));
      const labels: Record<string, string> = {
        monday: "週一",
        tuesday: "週二",
        wednesday: "週三",
        thursday: "週四",
        friday: "週五",
        saturday: "週六",
        sunday: "週日",
      };
      return `${labels[parts.weekday] || "特定時間"} ${parts.timeStr}`;
    } catch {
      return "特定時間";
    }
  }

  const headerTitle = isPocketMode
    ? activePocket
      ? `${activePocket.emoji ? `${activePocket.emoji} ` : ""}${activePocket.name}`
      : "口袋名單"
    : activeScenario
      ? activeScenario.title
      : selected.size > 0
        ? `${selected.size} 個條件`
        : "臺南";

  const isListLoading = isPocketMode ? pocketItemsQuery.isLoading : searchQuery.isLoading;
  const isListError = isPocketMode ? pocketItemsQuery.isError : searchQuery.isError;
  const listHeading = isListLoading
    ? "載入中…"
    : isPocketMode
      ? `${totalCount} 間 · 口袋名單`
      : activeScenario
        ? `${totalCount} 間${activeScenario.title}`
        : `${totalCount} 間 · 臺南`;

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
          <h1 className="truncate text-sm font-semibold px-2">{headerTitle}</h1>
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
          onClick={() => {
            const p = new URLSearchParams();
            selected.forEach((t) => p.append("tag", t));
            if (openAt) p.set("open_at", openAt);
            navigate(`/filter?${p.toString()}`);
          }}
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
            userLocation={location}
            paddingBottom={sheetPaddingPx}
            fitToCafesKey={isPocketMode ? `pocket:${pocketId}` : null}
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
          {openAt && (
            <div className="mx-5 mb-2 flex items-center justify-between rounded-lg bg-info/10 border border-info/20 px-3 py-1.5 text-xs text-info cp-anim-fade-in animate-none">
              <span className="flex items-center gap-1.5 font-medium">
                <span>🕒</span>
                <span>時間篩選：{formatOpenAtLabel(openAt)}</span>
              </span>
              <button
                type="button"
                onClick={() => setOpenAt(null)}
                className="btn btn-ghost btn-xs btn-circle h-5 w-5 min-h-0 text-base-content/60 hover:text-base-content"
                aria-label="清除時間篩選"
              >
                ✕
              </button>
            </div>
          )}
          <header className="flex items-baseline justify-between px-5 pb-2">
            <h2 className="text-[15px] font-semibold">{listHeading}</h2>
            {location && <span className="text-xs text-base-content/55">距離 ↓</span>}
          </header>
          <div className="divider my-0" />
          {isListError ? (
            <p className="px-5 py-6 text-center text-sm text-base-content/55">
              載入失敗，請稍後再試
            </p>
          ) : isListLoading ? (
            <ul className="flex-1 divide-y divide-base-content/10 overflow-y-auto">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="px-5 py-3">
                  <div className="h-14 bg-base-200 animate-pulse rounded" />
                </li>
              ))}
            </ul>
          ) : cafes.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-base-content/55">
              {isPocketMode ? "這個口袋還沒有咖啡店" : "找不到符合條件的咖啡店"}
            </p>
          ) : (
            <ul
              ref={listRef}
              className="flex-1 divide-y divide-base-content/10 overflow-y-auto"
            >
              {cafes.map((c) => (
                <li key={c.id} data-cafe-id={c.id}>
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
