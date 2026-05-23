import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams, useMatch, Link, useLocation } from "react-router-dom";
import { Drawer } from "vaul";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  Share01Icon,
  Settings01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  LinkForwardIcon,
  Bookmark02Icon,
  BookmarkCheck02Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { useIsDesktop } from "@/components/layout/Responsive";
import { FilterChipBar, type ChipOption } from "@/components/search/FilterChipBar";
import { CafeListItem } from "@/components/search/CafeListItem";
import { CafeMap } from "@/components/search/CafeMap";
import { SCENARIO_BY_KEY } from "@/components/search/ScenarioGrid";
import { MobileChoiceSheet } from "@/components/primitives";
import { CafeDetailContent } from "@/components/cafe/CafeDetailContent";
import { CafeActionModals } from "@/components/cafe/CafeActionModals";
import { useSearchSelection } from "@/hooks/useSearchSelection";
import { useAllCafes, useCafeDetail } from "@/hooks/useCafes";
import { useCafeActions } from "@/hooks/useCafeActions";
import { searchCafesLocal, type LocalSortKey } from "@/lib/cafeFilter";
import { usePocketItems, usePockets } from "@/hooks/usePockets";
import { useUserLocation } from "@/context/UserLocationContext";
import { haversineKm } from "@/lib/format";
import { shareUrl } from "@/lib/share";

const SORT_LABEL: Record<LocalSortKey, string> = {
  smart: "綜合",
  distance: "距離",
  rating: "評分",
};

const SORT_OPTIONS_MOBILE: { value: LocalSortKey; label: string; description: string }[] = [
  { value: "smart", label: "綜合", description: "結合距離與評分的推薦排序" },
  { value: "distance", label: "距離", description: "離你最近的優先" },
  { value: "rating", label: "評分", description: "Google 評分高的優先" },
];

const CHIP_OPTIONS: ChipOption[] = [
  { key: "now", label: "現在營業" },
  { key: "no_limit", label: "不限時" },
  { key: "socket", label: "有插座" },
  { key: "study", label: "適合讀書" },
];

/**
 * Sheet snap points 參考 Google Maps:
 *   - 列表模式 (list):  [0.3, 0.7] —— peek / full
 *   - 詳細模式 (detail): [0.3, 0.5, 0.9] —— mini / half / expanded
 *
 * 改用 vaul 後,拖曳/momentum/snap/click-vs-drag/inner-scroll 全部由套件處理,
 * 我們只負責給 snapPoints 與監聽 activeSnapPoint 來連動地圖。
 */
const LIST_SNAPS: (number | string)[] = [0.3, 0.7];
const DETAIL_SNAPS: (number | string)[] = [0.3, 0.5, 0.9];

/**
 * 桌面已在 / 首頁整合,/map 主要服務手機。
 * 為了直接連結時 desktop 也能看,desktop redirect 到首頁。
 *
 * 手機端 /cafe/:slug 也由本元件處理 —— 路徑包含 slug 即進入「詳細模式」,
 * sheet 內容從列表切成 CafeDetailContent,封面圖位置改放在 AI 摘要之後。
 */
export default function MapPage() {
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const cafeMatch = useMatch("/cafe/:slug");
  const detailSlug = cafeMatch?.params.slug ?? null;
  const isDetailMode = !!detailSlug;

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
  // 由 vaul 控制的 active snap。模式切換時在 effect 裡同步預設值。
  const [snap, setSnap] = useState<number | string | null>(0.3);
  const snapPoints = useMemo(() => (isDetailMode ? DETAIL_SNAPS : LIST_SNAPS), [isDetailMode]);

  const [sortKey, setSortKey] = useState<LocalSortKey>("smart");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [vh, setVh] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  const listRef = useRef<HTMLUListElement>(null);
  const sheetScrollRef = useRef<HTMLDivElement>(null);

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

  // 模式切換時把 snap 預設到該模式的常用位置 —— 進詳細頁停在 half(0.5),
  // 回列表停在 peek(0.3)。切到別家店時也順便把 sheet 內容滾回頂端。
  const prevSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (detailSlug && detailSlug !== prevSlugRef.current) {
      setSnap(0.5);
      sheetScrollRef.current?.scrollTo({ top: 0 });
    } else if (!detailSlug && prevSlugRef.current) {
      setSnap(0.3);
    }
    prevSlugRef.current = detailSlug;
  }, [detailSlug]);

  const { location: userLocation } = useUserLocation();
  const currentRatio = typeof snap === "number" ? snap : 0.3;
  // Mapbox flyTo 把這段高度當作不可見區域 —— expanded 時 sheet 蓋掉大部分畫面,
  // padding 太大會讓 marker 飛到看不到的地方,所以鎖在 0.55 以下。
  const sheetPaddingPx = Math.round(vh * Math.min(currentRatio, 0.55));

  const allCafes = useAllCafes();
  const tagsArr = Array.from(selected);
  const tagsKey = tagsArr.join(",");
  const orKey = orSelected.join(",");
  const searchResult = useMemo(() => {
    const cafes = searchCafesLocal(allCafes.data, {
      tags: tagsArr,
      tagsOr: orSelected,
      userLng: userLocation?.lng ?? null,
      userLat: userLocation?.lat ?? null,
      radiusM,
      openAt,
      q: keyword,
      sort: sortKey,
    });
    return { cafes, total: cafes.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCafes.data, tagsKey, orKey, userLocation?.lng, userLocation?.lat, radiusM, openAt, keyword, sortKey]);
  const searchQuery = {
    data: searchResult,
    isLoading: allCafes.isLoading,
    isError: allCafes.isError,
  };

  // Pocket 模式 —— 從 /pocket 點「在地圖上看這個口袋」進來。直接以 pocket items
  // 取代 search 結果,並把鏡頭收進這批點(由 CafeMap 的 fitToCafesKey 觸發)。
  const pocketItemsQuery = usePocketItems(pocketId);
  const { data: pockets } = usePockets();
  const isPocketMode = !!pocketId;
  const pocketCafes = (pocketItemsQuery.data ?? [])
    .map((item) => item.cafe)
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) =>
      userLocation
        ? { ...c, distance_km: haversineKm(userLocation, { lng: c.lng, lat: c.lat }) }
        : c,
    )
    .sort((a, b) => (userLocation ? a.distance_km - b.distance_km : 0));
  const baseCafes = isPocketMode ? pocketCafes : (searchQuery.data?.cafes ?? []);
  const totalCount = isPocketMode ? pocketCafes.length : (searchQuery.data?.total ?? 0);
  const activePocket = pockets?.find((p) => p.id === pocketId) ?? null;
  const activeScenario = scenario ? SCENARIO_BY_KEY[scenario] : null;

  // 詳細模式時抓對應 cafe 詳細資料,並補上 marker
  const detailQuery = useCafeDetail(detailSlug);
  const detailCafe = detailQuery.data ?? null;
  const actions = useCafeActions(detailCafe?.id ?? null);

  // 跟 DesktopApp 同樣處理 —— 被選中的咖啡廳如果不在 baseCafes(被 tag 過濾,
  // 或不在 pocket 列表內),仍要在地圖補一個 marker,否則使用者進詳細頁卻看不到位置。
  const mapCafes =
    detailCafe && !baseCafes.some((c) => c.id === detailCafe.id)
      ? [
          ...baseCafes,
          userLocation
            ? { ...detailCafe, distance_km: haversineKm(userLocation, { lng: detailCafe.lng, lat: detailCafe.lat }) }
            : detailCafe,
        ]
      : baseCafes;

  // 詳細模式下 activeId = 詳細 cafe;列表模式下沿用原本的 markerClick 設的 activeId。
  const effectiveActiveId = isDetailMode ? detailCafe?.id ?? null : activeId;

  // 點圖標 → 自動把對應 list item 捲到可視區域(僅列表模式下有意義)。
  useEffect(() => {
    if (isDetailMode || !activeId) return;
    const li = listRef.current?.querySelector<HTMLElement>(
      `[data-cafe-id="${activeId}"]`,
    );
    if (li) {
      li.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeId, baseCafes, isDetailMode]);

  // 在 pocket 模式下,所有導航都要把 ?pocket=<id> 帶著走。
  const pocketSearch = isPocketMode ? `?pocket=${encodeURIComponent(pocketId!)}` : "";

  // 點地圖空白處:詳細模式縮成 mini,讓地圖放大顯示。列表模式不做事,
  // 避免使用者只是想滑地圖卻意外把列表收起來。
  const handleMapClick = useCallback(() => {
    if (isDetailMode) setSnap(0.3);
  }, [isDetailMode]);

  const handleMarkerClick = (id: string) => {
    const c = mapCafes.find((x) => x.id === id);
    if (!c) return;
    // 列表模式 → 點 marker = 進詳細頁;詳細模式 → 也允許切換到另一家(replace history)
    if (isDetailMode) {
      navigate(`/cafe/${c.slug ?? c.id}${pocketSearch}`, { replace: true });
    } else {
      setActiveId(id);
      setSnap(0.3);
      navigate(`/cafe/${c.slug ?? c.id}${pocketSearch}`);
    }
  };

  if (isDesktop) {
    const p = new URLSearchParams();
    initial.forEach((t) => p.append("tag", t));
    if (initialOpenAt) p.set("open_at", initialOpenAt);
    if (isDetailMode && detailSlug) {
      navigate(`/cafe/${detailSlug}?${p.toString()}`, { replace: true });
    } else {
      navigate(`/?${p.toString()}`, { replace: true });
    }
    return null;
  }

  // ─── Header (依模式切換) ────────────────────────────────────
  const headerTitle = isDetailMode
    ? detailCafe?.name ?? (detailQuery.isLoading ? "載入中…" : "找不到這間店")
    : isPocketMode
      ? activePocket
        ? `${activePocket.emoji ? `${activePocket.emoji} ` : ""}${activePocket.name}`
        : "口袋名單"
      : activeScenario
        ? activeScenario.title
        : selected.size > 0
          ? `${selected.size} 個條件`
          : "臺南";

  const handleBack = () => {
    if (isDetailMode) {
      // location.key === "default" 代表沒有 history(直連進來的),fallback 到 /map
      if (location.key !== "default") {
        navigate(-1);
      } else {
        navigate(`/map${pocketSearch}`, { replace: true });
      }
    } else {
      navigate("/");
    }
  };

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
      {/* 固定 header */}
      <header className="navbar sticky top-0 z-30 min-h-12 border-b border-base-content/10 bg-base-100/95 px-2 backdrop-blur">
        {/* DaisyUI 把 `.navbar-start` / `.navbar-end` 寫死 `width: 50%`,
            導致中間標題容器塌成 ~16px、長店名被切到剩一個字。`!w-auto` 把寬度交還
            給 flex 自動分配,讓兩側只佔自己按鈕的寬度,中間 flex-1 才有空間。 */}
        <div className="navbar-start !w-auto !flex-none">
          <button
            type="button"
            onClick={handleBack}
            className="btn btn-ghost btn-sm btn-square"
            aria-label="返回"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-w-0 flex-1 px-2">
          <h1 className="truncate text-sm font-semibold text-center">{headerTitle}</h1>
        </div>
        <div className="navbar-end !w-auto !flex-none gap-1">
          {isDetailMode && actions.user && detailCafe && (
            <button
              type="button"
              onClick={actions.handlePocketClick}
              disabled={actions.pocketDisabled}
              aria-label={actions.inPocket ? "已加入口袋" : "加入口袋"}
              className={`btn btn-ghost btn-sm btn-square ${actions.inPocket ? "text-primary" : ""}`}
            >
              <HugeiconsIcon
                icon={actions.inPocket ? BookmarkCheck02Icon : Bookmark02Icon}
                size={18}
                strokeWidth={1.5}
              />
            </button>
          )}
          <button
            type="button"
            onClick={() => shareUrl(window.location.href, isDetailMode ? detailCafe?.name : undefined)}
            aria-label="分享"
            className="btn btn-ghost btn-sm btn-square"
          >
            <HugeiconsIcon icon={isDetailMode ? LinkForwardIcon : Share01Icon} size={18} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* chip bar — 僅列表模式顯示 */}
      {!isDetailMode && (
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
      )}

      {/* 地圖區 + bottom sheet */}
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <CafeMap
            cafes={mapCafes}
            activeId={effectiveActiveId}
            userLocation={userLocation}
            paddingBottom={sheetPaddingPx}
            fitToCafesKey={isPocketMode ? `pocket:${pocketId}` : null}
            onMarkerClick={handleMarkerClick}
            onMapClick={handleMapClick}
            // 手機:隱藏 +/- 改用手指縮放;定位按鈕 sheet 超過 50% 時隱藏(會被蓋住,
            // 跟 Google Maps 行為一致)。currentRatio 來自 vaul 的 activeSnapPoint。
            hideZoomButtons
            hideLocateButton={currentRatio > 0.5}
          />
        </div>

        {/* Vaul Drawer ── 整面拖曳 + click/drag 自動區分 + 慣性 + 內部 scroll 共存。
            modal=false:背後地圖保留互動(可拖、可點 marker)。
            dismissible=false:最低 snap 是地板,使用者拉不下去 ── 關閉只能透過 ✕
            按鈕或系統返回,語意更明確。
            shouldScaleBackground=false:不縮放背景,避免地圖被擠壓變形。 */}
        <Drawer.Root
          open
          modal={false}
          dismissible={false}
          shouldScaleBackground={false}
          snapPoints={snapPoints}
          activeSnapPoint={snap}
          setActiveSnapPoint={setSnap}
        >
          <Drawer.Portal>
            <Drawer.Content
              // vaul 的 snap 算式假設 Content 與 viewport 等高 —— 給 h-full(100vh)。
              // 不能加 max-h,否則 translate 量會多出 drawer 與 viewport 的差,sheet
              // 在 snap 0.3 看起來只露 ~25% 而不是 30%。snap 最大 0.9,top 不會碰到 header。
              // z-20 < header 的 z-30,detail expanded 時若視覺超過 header 也被它蓋住。
              className="fixed inset-x-0 bottom-0 z-20 flex h-full flex-col rounded-t-xl border-t border-base-content/10 bg-base-100 shadow-2xl outline-none"
            >
              {/* a11y:標題與描述對螢幕報讀器宣告,視覺上不顯示。
                  Radix Dialog 強制要求兩者都要有 aria-* 對應,缺一會在 console 報 warn。 */}
              <Drawer.Title className="sr-only">
                {isDetailMode ? `${detailCafe?.name ?? "咖啡店"}詳細資訊` : "搜尋結果"}
              </Drawer.Title>
              <Drawer.Description className="sr-only">
                {isDetailMode ? "向下拖曳可關閉,或點右上角的關閉按鈕" : "可上下拖曳調整面板高度"}
              </Drawer.Description>

              {/* 拖把手 ── vaul 內建 Handle 自帶 aria/pointer 行為。
                  整個 Drawer.Content 都可以拖,Handle 只是視覺指示器。 */}
              <Drawer.Handle className="!mt-2 !mb-0 !h-1 !w-9 !bg-base-content/30" />

              {isDetailMode && (
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label="關閉"
                  className="btn btn-ghost btn-sm btn-circle absolute right-3 top-6 bg-base-100/70 backdrop-blur border border-base-content/10"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.5} />
                </button>
              )}

              {isDetailMode ? (
                <div ref={sheetScrollRef} className="flex-1 overflow-y-auto overscroll-contain">
                  {detailQuery.isLoading ? (
                    <div className="space-y-3 p-5">
                      <div className="h-6 bg-base-200 animate-pulse rounded w-1/2" />
                      <div className="h-4 bg-base-200 animate-pulse rounded w-3/4" />
                      <div className="h-24 bg-base-200 animate-pulse rounded" />
                      <div className="h-40 bg-base-200 animate-pulse rounded" />
                    </div>
                  ) : detailCafe ? (
                    <CafeDetailContent cafe={detailCafe} isDesktop={false} actions={actions} coverPlacement="mid" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-6">
                      <div role="alert" className="alert alert-warning max-w-sm">
                        <HugeiconsIcon icon={AlertCircleIcon} size={18} strokeWidth={1.5} />
                        <span>{detailQuery.isError ? "載入失敗，請稍後再試" : "找不到這間店"}</span>
                        <Link to="/" className="btn btn-sm btn-neutral">
                          回首頁
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <header className="flex items-baseline justify-between px-5 pt-3 pb-2">
                    <h2 className="text-[15px] font-semibold">{listHeading}</h2>
                    <button
                      type="button"
                      onClick={() => setIsSortOpen(true)}
                      className="flex items-center gap-1 text-xs text-base-content/65 hover:text-base-content transition-colors px-1 py-0.5"
                      aria-haspopup="dialog"
                    >
                      {SORT_LABEL[sortKey]}
                      <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={1.5} />
                    </button>
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
                  ) : baseCafes.length === 0 ? (
                    <p className="px-5 py-6 text-center text-sm text-base-content/55">
                      {isPocketMode ? "這個口袋還沒有咖啡店" : "找不到符合條件的咖啡店"}
                    </p>
                  ) : (
                    <ul
                      ref={listRef}
                      className="flex-1 divide-y divide-base-content/10 overflow-y-auto"
                    >
                      {baseCafes.map((c) => (
                        <li key={c.id} data-cafe-id={c.id}>
                          <CafeListItem cafe={c} active={c.id === activeId} sortKey={sortKey} />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>

      <MobileChoiceSheet
        isOpen={isSortOpen}
        onClose={() => setIsSortOpen(false)}
        title="選擇排序方式"
        value={sortKey}
        options={SORT_OPTIONS_MOBILE}
        onChange={setSortKey}
      />

      {/* 詳細模式下用到的 modal (回報、加入口袋等) */}
      {isDetailMode && <CafeActionModals actions={actions} />}
    </div>
  );
}
