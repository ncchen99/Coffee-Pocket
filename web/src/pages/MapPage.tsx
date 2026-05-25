import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams, useMatch, useLocation } from "react-router-dom";
import { Drawer } from "vaul";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  AlertCircleIcon,
  Settings01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { useIsDesktop } from "@/components/layout/Responsive";
import { CafeListItem } from "@/components/search/CafeListItem";
import { CafeMap } from "@/components/search/CafeMap";
import { SCENARIO_BY_KEY, type Scenario } from "@/components/search/ScenarioGrid";
import { MobileChoiceSheet } from "@/components/primitives";
import { CafeDetailContent } from "@/components/cafe/CafeDetailContent";
import { CafeActionModals } from "@/components/cafe/CafeActionModals";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { MapSearchOverlay, type SearchMode } from "@/components/search/MapSearchOverlay";
import { IdleSheetContent } from "@/components/search/IdleSheetContent";
import { SearchingSheetContent } from "@/components/search/SearchingSheetContent";
import { PocketSheetContent } from "@/components/cafe/PocketSheetContent";
import { ProfileSheetContent } from "@/components/cafe/ProfileSheetContent";
import { useSearchSelection } from "@/hooks/useSearchSelection";
import { useAllCafes, useCafeDetail } from "@/hooks/useCafes";
import { useCafeActions } from "@/hooks/useCafeActions";
import { searchCafesLocal, type LocalSortKey } from "@/lib/cafeFilter";
import { usePocketItems, usePockets } from "@/hooks/usePockets";
import { useUserLocation } from "@/context/UserLocationContext";
import { haversineKm } from "@/lib/format";

type MobileTab = "home" | "pocket" | "profile";

/**
 * Sheet snap points 依 (tab, isDetail) 組合切換。
 *   - detail: [0.3, 0.5, 0.9]
 *   - home / pocket: [0.3, 0.7]
 *   - profile: [0.55, 0.9]
 *
 * Searching 模式不走 drawer,而是另一個全屏 overlay,所以這裡不列。
 */
// 詳細模式的最高 snap 留一點空間給浮動搜尋框 (~92px ≈ 11% vh),不讓它蓋到 cafe header。
const DETAIL_SNAPS: (number | string)[] = [0.3, 0.5, 0.85];
const HOME_SNAPS: (number | string)[] = [0.3, 0.7];
const POCKET_SNAPS: (number | string)[] = [0.3, 0.7];
const PROFILE_SNAPS: (number | string)[] = [0.55, 0.9];

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

const IDLE_RECOMMEND_LIMIT = 30;

function pathToTab(pathname: string): MobileTab {
  if (pathname.startsWith("/pocket")) return "pocket";
  if (pathname.startsWith("/profile")) return "profile";
  return "home";
}

/**
 * 手機端的單一 shell:Map 永不卸載,MapSearchOverlay 浮動於上(僅 home tab),
 * 底部 vaul Drawer 依 (tab, isDetail) 切換內容,searching 模式則覆蓋一層全屏 overlay。
 * MobileTabBar 永遠在最底層 z-index 之上,可隨時切 home / pocket / profile。
 */
export default function MapPage() {
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [params] = useSearchParams();
  const cafeMatch = useMatch("/cafe/:slug");
  const detailSlug = cafeMatch?.params.slug ?? null;
  const isDetailMode = !!detailSlug;
  const tab: MobileTab = pathToTab(routerLocation.pathname);

  // ─── 資料 (提早宣告以供 useEffect 使用) ────────────────
  const { location: userLocation } = useUserLocation();
  const allCafes = useAllCafes();
  const detailCafeFromAll = useMemo(() => {
    if (!detailSlug || !allCafes.data) return null;
    return allCafes.data.find((c) => c.slug === detailSlug || c.id === detailSlug) ?? null;
  }, [detailSlug, allCafes.data]);


  // URL 初始化(保留分享 / 書籤)
  const initialTags = useMemo(() => params.getAll("tag"), [params]);
  const initialOpenAt = params.get("open_at");
  const initialKeyword = params.get("q");
  const initialScenario = params.get("scenario");
  const initialD = params.get("d");
  const initialRadiusM = initialD != null ? Number(initialD) * 1000 : null;
  const pocketIdFromUrl = params.get("pocket");

  const {
    selected,
    orSelected,
    toggle,
    setAll,
    setOrSelected,
    query,
    setQuery,
    scenario,
    pickScenario,
    openAt,
    setOpenAt,
    radiusM,
    setRadiusM,
    keyword,
    setKeyword,
  } = useSearchSelection(initialTags, initialRadiusM, initialKeyword);

  // searchMode 衍生
  const hasActiveSearch =
    selected.size > 0 ||
    !!keyword ||
    !!query.trim() ||
    !!scenario ||
    !!openAt ||
    radiusM != null;
  const [isSearching, setIsSearching] = useState(false);
  const searchMode: SearchMode = isSearching
    ? "searching"
    : hasActiveSearch
    ? "results"
    : "idle";

  // 切到 detail 或非 home tab 時關掉 searching
  useEffect(() => {
    if (isDetailMode || tab !== "home") setIsSearching(false);
  }, [isDetailMode, tab]);

  // ─── Sheet snap (vaul) ──────────────────────────
  const snapPoints = useMemo(() => {
    if (isDetailMode) return DETAIL_SNAPS;
    if (tab === "pocket") return POCKET_SNAPS;
    if (tab === "profile") return PROFILE_SNAPS;
    return HOME_SNAPS;
  }, [isDetailMode, tab]);
  const [snap, setSnap] = useState<number | string | null>(snapPoints[0]);

  // 切換 mode → 重設 snap 到該模式預設位置
  const prevSlugRef = useRef<string | null>(null);
  const prevTabRef = useRef<MobileTab>(tab);
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  // 進入 detail 前的 sheet 高度 —— 關閉 detail 時要還原,避免使用者本來把面板拉到
  // 70% 在瀏覽清單,回來卻被重設成 30% 預設值。
  const savedSnapRef = useRef<number | string | null>(null);
  // 搜尋結果 / 推薦清單的捲動進度 —— 進入 detail 時 ul 會卸載,回到清單時要還原到剛剛
  // 瀏覽的捲動位置(像素級)。用 onScroll 持續寫進 ref;ul 重新 mount 時透過 callback ref
  // 在 rAF 中還原,避開 vaul Drawer 在 snap 切換時的 scrollTop 重設。
  const searchScrollTopRef = useRef(0);
  const idleScrollTopRef = useRef(0);
  const [isDetailScrolled, setIsDetailScrolled] = useState(false);
  // 把當前 snap 持續寫入 ref,避免 setActiveSnapPoint 拖曳時的更新沒有同步進 effect。
  const snapValueRef = useRef<number | string | null>(snap);
  useEffect(() => {
    snapValueRef.current = snap;
  }, [snap]);
  useEffect(() => {
    if (detailSlug && detailSlug !== prevSlugRef.current) {
      // 第一次進入 detail(從非 detail 切過去)時記下原本的 snap;
      // detail 內切換另一家(prevSlugRef 也是非 null)時不要覆蓋,保留最初的值。
      if (!prevSlugRef.current) {
        savedSnapRef.current = snapValueRef.current;
      }
      setSnap(0.5);
      sheetScrollRef.current?.scrollTo({ top: 0 });
      setIsDetailScrolled(false);
      setActiveMarkerId(detailCafeFromAll?.id ?? detailSlug);
    } else if (!detailSlug && prevSlugRef.current) {
      // 離開 detail → 還原進 detail 前的 snap(沒記到就 fallback 預設),
      // 並清掉 active marker,讓 CafeMap 偵測到 activeId 由有變無、把鏡頭還原。
      setSnap(savedSnapRef.current ?? snapPoints[0]);
      savedSnapRef.current = null;
      setActiveMarkerId(null);
    }
    prevSlugRef.current = detailSlug;
  }, [detailSlug, snapPoints, detailCafeFromAll]);
  useEffect(() => {
    if (tab !== prevTabRef.current) {
      setSnap(snapPoints[0]);
      prevTabRef.current = tab;
    }
  }, [tab, snapPoints]);

  const [vh, setVh] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight,
  );
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 啟動時根據 URL ?scenario= 還原(僅一次)
  useEffect(() => {
    if (initialScenario && SCENARIO_BY_KEY[initialScenario]) {
      pickScenario(SCENARIO_BY_KEY[initialScenario]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (initialOpenAt) setOpenAt(initialOpenAt);
  }, [initialOpenAt, setOpenAt]);

  // 阻斷 Vaul drawer 的 focus trap 以修復無法打字的問題
  useEffect(() => {
    if (isSearching) {
      const handleFocus = (e: FocusEvent) => {
        e.stopImmediatePropagation();
      };
      document.addEventListener("focusin", handleFocus, true);
      document.addEventListener("focusout", handleFocus, true);
      return () => {
        document.removeEventListener("focusin", handleFocus, true);
        document.removeEventListener("focusout", handleFocus, true);
      };
    }
  }, [isSearching]);

  const currentRatio = typeof snap === "number" ? snap : 0.3;
  // searching 時 overlay 蓋全屏,但 Map 仍要保留可視中心(flyTo padding 太大會跑出畫面)。
  // 鎖在 0.55 上限,符合 detail expanded 行為。
  const sheetPaddingPx = Math.round(
    vh * Math.min(isSearching ? 0.55 : currentRatio, 0.55),
  );

  // ─── Sheet 內捲動與拖曳的協作 ──────────────────────
  // 非最低 snap 時,把 sheet 內所有可滾動容器標上 data-vaul-no-drag,
  // 讓 vaul 不要在使用者單純捲動內容時搶手勢(原本會造成 sheet 抖動)。
  // 同時自行在 touch 事件裡監聽:「scrollTop=0 + 繼續往下拉」→ 收 sheet 到下一段 snap。
  const maxSnapPoint = snapPoints[snapPoints.length - 1];
  const isAtMaxSnap = typeof snap === "number" && snap === (maxSnapPoint as number);
  useEffect(() => {
    const root = document.querySelector("[data-vaul-drawer]");
    if (!root) return;
    const apply = () => {
      root.querySelectorAll<HTMLElement>(".overflow-y-auto").forEach((el) => {
        if (!isAtMaxSnap) el.removeAttribute("data-vaul-no-drag");
        else el.setAttribute("data-vaul-no-drag", "");
      });
    };
    apply();
    // 切 tab / 進出 detail 時 sheet 內容會換成新的 DOM 節點,observer 持續補上屬性。
    const mo = new MutationObserver(apply);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [isAtMaxSnap]);

  const touchDragYRef = useRef<number | null>(null);
  const touchDragScrollerRef = useRef<HTMLElement | null>(null);
  const handleSheetTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    touchDragScrollerRef.current = target.closest<HTMLElement>(".overflow-y-auto");
    touchDragYRef.current = e.touches[0].clientY;
  };
  const handleSheetTouchMove = (e: React.TouchEvent) => {
    const startY = touchDragYRef.current;
    const scroller = touchDragScrollerRef.current;
    if (startY == null || !scroller) return;
    const dy = e.touches[0].clientY - startY;
    if (isAtMaxSnap && scroller.scrollTop <= 0 && dy > 32 && typeof snap === "number") {
      const idx = snapPoints.indexOf(snap);
      if (idx > 0) {
        setSnap(snapPoints[idx - 1]);
        touchDragYRef.current = null;
        touchDragScrollerRef.current = null;
      }
    }
  };
  const handleSheetTouchEnd = () => {
    touchDragYRef.current = null;
    touchDragScrollerRef.current = null;
  };

  // ─── 資料 ────────────────────────────────────────
  const tagsArr = Array.from(selected);
  const tagsKey = tagsArr.join(",");
  const orKey = orSelected.join(",");
  const [sortKey, setSortKey] = useState<LocalSortKey>("smart");
  const [isSortOpen, setIsSortOpen] = useState(false);

  // home tab 的搜尋結果
  const searchResult = useMemo(() => {
    const tagsWithoutNow = tagsArr.filter((t) => t !== "now");
    const effectiveOpenAt = selected.has("now") ? new Date().toISOString() : openAt;

    const cafes = searchCafesLocal(allCafes.data, {
      tags: tagsWithoutNow,
      tagsOr: orSelected,
      userLng: userLocation?.lng ?? null,
      userLat: userLocation?.lat ?? null,
      radiusM,
      openAt: effectiveOpenAt,
      q: keyword || query.trim() || null,
      sort: sortKey,
    });

    return { cafes, total: cafes.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allCafes.data,
    tagsKey,
    orKey,
    userLocation?.lng,
    userLocation?.lat,
    radiusM,
    openAt,
    keyword,
    query,
    sortKey,
  ]);

  // Idle 推薦
  const idleRecommendations = useMemo(() => {
    if (!allCafes.data) return [];
    return searchCafesLocal(allCafes.data, {
      userLng: userLocation?.lng ?? null,
      userLat: userLocation?.lat ?? null,
      sort: "smart",
    }).slice(0, IDLE_RECOMMEND_LIMIT);
  }, [allCafes.data, userLocation?.lng, userLocation?.lat]);

  // Pocket items — pocket/profile tab 都顯示
  const { data: pockets } = usePockets();
  const [activePocketId, setActivePocketId] = useState<string | null>(pocketIdFromUrl);
  useEffect(() => {
    if (pocketIdFromUrl) setActivePocketId(pocketIdFromUrl);
  }, [pocketIdFromUrl]);
  useEffect(() => {
    if (!activePocketId && pockets && pockets.length > 0) {
      setActivePocketId(pockets[0].id);
    }
  }, [pockets, activePocketId]);
  const pocketItemsQuery = usePocketItems(tab !== "home" ? activePocketId : null);
  const pocketCafes = useMemo(
    () =>
      (pocketItemsQuery.data ?? [])
        .map((item) => item.cafe)
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) =>
          userLocation
            ? { ...c, distance_km: haversineKm(userLocation, { lng: c.lng, lat: c.lat }) }
            : c,
        )
        .sort((a, b) => (userLocation ? a.distance_km - b.distance_km : 0)),
    [pocketItemsQuery.data, userLocation],
  );

  // 地圖 marker:home → search 結果(idle 沒 filter 也算搜尋,只是回傳全量,
  //                         所以這裡 idle 也用搜尋結果但只取推薦清單作 marker)
  //              pocket/profile → pocket items
  const homeMapCafes = searchMode === "idle" ? idleRecommendations : searchResult.cafes;
  const baseMapCafes = tab === "home" ? homeMapCafes : pocketCafes;

  // Detail 補 marker
  const detailQuery = useCafeDetail(detailSlug);
  const detailCafe = detailQuery.data ?? null;
  const actions = useCafeActions(detailCafe?.id ?? null);
  const mapCafes = useMemo(() => {
    if (!detailCafe || baseMapCafes.some((c) => c.id === detailCafe.id)) return baseMapCafes;
    return [
      ...baseMapCafes,
      userLocation
        ? { ...detailCafe, distance_km: haversineKm(userLocation, { lng: detailCafe.lng, lat: detailCafe.lat }) }
        : detailCafe,
    ];
  }, [baseMapCafes, detailCafe, userLocation]);

  // ─── 捲動位置記錄與還原 ──────────────────────────
  const searchListRefCallback = useCallback((el: HTMLUListElement | null) => {
    if (!el) return;
    requestAnimationFrame(() => {
      if (el) {
        el.scrollTop = searchScrollTopRef.current;
        requestAnimationFrame(() => {
          if (el) {
            el.scrollTop = searchScrollTopRef.current;
          }
        });
      }
    });
  }, []);

  const idleListRefCallback = useCallback((el: HTMLUListElement | null) => {
    if (!el) return;
    requestAnimationFrame(() => {
      if (el) {
        el.scrollTop = idleScrollTopRef.current;
        requestAnimationFrame(() => {
          if (el) {
            el.scrollTop = idleScrollTopRef.current;
          }
        });
      }
    });
  }, []);

  const handleSearchListScroll = useCallback((e: React.UIEvent<HTMLUListElement>) => {
    searchScrollTopRef.current = e.currentTarget.scrollTop;
  }, []);

  const handleIdleListScroll = useCallback((e: React.UIEvent<HTMLUListElement>) => {
    idleScrollTopRef.current = e.currentTarget.scrollTop;
  }, []);

  // 搜尋條件變動 → 搜尋結果集換了，重設搜尋清單的捲動位置
  useEffect(() => {
    searchScrollTopRef.current = 0;
  }, [tagsKey, orKey, keyword, query, sortKey, openAt, radiusM]);

  // ─── 操作 handlers ───────────────────────────────
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const effectiveActiveId = isDetailMode
    ? (detailCafeFromAll?.id ?? detailSlug)
    : activeMarkerId;

  const handleMarkerClick = (id: string) => {
    const c = mapCafes.find((x) => x.id === id);
    if (!c) return;
    if (isDetailMode) {
      navigate(`/cafe/${c.slug ?? c.id}`, { replace: true });
    } else {
      setActiveMarkerId(id);
      setSnap(0.3);
      navigate(`/cafe/${c.slug ?? c.id}`);
    }
  };

  const handleMapClick = useCallback(() => {
    setSnap(0.3);
  }, []);

  // 搜尋提交 (AI 解析 / keyword / tag label)
  const handleSubmitSearch = (
    parsedTags: string[],
    softTags: string[],
    parsedOpenAt: string | null,
    _distanceKm: number | null,
    submittedKeyword: string | null,
  ) => {
    if (submittedKeyword) {
      setAll([]);
      setOpenAt(null);
      setKeyword(submittedKeyword);
    } else {
      setAll(parsedTags);
      setOrSelected(softTags);
      setOpenAt(parsedOpenAt);
      setQuery("");
    }
    setIsSearching(false);
  };

  const handleOverlayBack = () => {
    if (isSearching) {
      setIsSearching(false);
      return;
    }
    // results 模式按 ← :清空回 idle
    handleOverlayClear();
  };
  const handleOverlayClear = () => {
    setAll([]);
    setOpenAt(null);
    setRadiusM(null);
    setKeyword(null);
    setQuery("");
    setIsSearching(false);
  };

  const handleDetailBack = () => {
    if (routerLocation.key !== "default") navigate(-1);
    else navigate(tab === "home" ? "/" : `/${tab}`, { replace: true });
  };

  // ─── 桌面 redirect ───────────────────────────────
  if (isDesktop) {
    const p = new URLSearchParams();
    initialTags.forEach((t) => p.append("tag", t));
    if (initialOpenAt) p.set("open_at", initialOpenAt);
    if (isDetailMode && detailSlug) {
      navigate(`/cafe/${detailSlug}?${p.toString()}`, { replace: true });
    } else if (tab === "home") {
      navigate(`/?${p.toString()}`, { replace: true });
    }
    return null;
  }

  // ─── Sheet 內容 dispatch ─────────────────────────
  // 詳細模式下也保留搜尋框 — 使用者可以從 detail 直接觸發新的搜尋,
  // 不需要先按返回。Pocket / Profile tab 仍然不顯示。
  const showMapSearchOverlay = tab === "home";

  // Tab bar 只在「首頁推薦 / 口袋 / 個人」這三個頁面顯示；
  // 進入搜尋、結果列表、詳細資訊時都隱藏,避免擋到 sheet 操作。
  const showTabBar =
    !isDetailMode &&
    !isSearching &&
    (tab === "pocket" || tab === "profile" || (tab === "home" && searchMode === "idle"));
  const drawerBottomPad = showTabBar ? "pb-[48px]" : "pb-0";

  const renderDrawerContent = () => {
    if (isDetailMode) {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          {detailCafe && (
            <header className="px-5 pt-2 pb-2.5 flex items-center justify-between gap-3 shrink-0">
              <h2 className="text-2xl font-bold tracking-tight truncate flex-1">{detailCafe.name}</h2>
              <button
                type="button"
                onClick={handleDetailBack}
                aria-label="關閉"
                className="btn btn-ghost btn-sm btn-square text-base-content/65 hover:text-base-content shrink-0"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
              </button>
            </header>
          )}
          {detailCafe && (
            <div
              className={`border-b border-base-content/10 transition-opacity duration-200 shrink-0 ${
                isDetailScrolled ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
          <div
            ref={sheetScrollRef}
            onScroll={(e) => setIsDetailScrolled(e.currentTarget.scrollTop > 0)}
            className="flex-1 overflow-y-auto overscroll-contain pb-[15vh]"
          >
            {detailQuery.isLoading ? (
              <div className="space-y-3 p-5">
                <div className="h-6 w-1/2 animate-pulse rounded bg-base-200" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-base-200" />
                <div className="h-24 animate-pulse rounded bg-base-200" />
                <div className="h-40 animate-pulse rounded bg-base-200" />
              </div>
            ) : detailCafe ? (
              <CafeDetailContent
                cafe={detailCafe}
                isDesktop={false}
                actions={actions}
                coverPlacement="mid"
                onClose={handleDetailBack}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <div role="alert" className="alert alert-warning max-w-sm">
                  <HugeiconsIcon icon={AlertCircleIcon} size={18} strokeWidth={1.5} />
                  <span>{detailQuery.isError ? "載入失敗，請稍後再試" : "找不到這間店"}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
    if (tab === "pocket") {
      return (
        <PocketSheetContent
          activePocketId={activePocketId}
          onActivePocketIdChange={setActivePocketId}
        />
      );
    }
    if (tab === "profile") {
      return <ProfileSheetContent />;
    }
    // home tab
    if (searchMode === "results") {
      const isListLoading = allCafes.isLoading;
      const isListError = allCafes.isError;
      const total = searchResult.total;
      const activeScenario = scenario ? SCENARIO_BY_KEY[scenario] : null;
      const heading = isListLoading
        ? "載入中…"
        : activeScenario
        ? `${total} 間${activeScenario.title}`
        : `${total} 間 · 臺南`;
      return (
        <>
          <header className="flex items-center justify-between px-5 pt-1 pb-2">
            <h2 className="text-[15px] font-semibold">{heading}</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsSearching(true)}
                className="flex items-center gap-1 px-1 py-0.5 text-xs text-base-content/65 hover:text-base-content"
                aria-label="進階篩選"
              >
                <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => setIsSortOpen(true)}
                className="flex items-center gap-1 px-1 py-0.5 text-xs text-base-content/65 hover:text-base-content"
                aria-haspopup="dialog"
              >
                {SORT_LABEL[sortKey]}
                <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={1.5} />
              </button>
            </div>
          </header>
          <div className="h-[1px] bg-base-content/10 w-full shrink-0" />
          {isListError ? (
            <p className="px-5 py-6 text-center text-sm text-base-content/55">
              載入失敗，請稍後再試
            </p>
          ) : isListLoading ? (
            <ul className="flex-1 divide-y divide-base-content/10 overflow-y-auto">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="px-5 py-3">
                  <div className="h-14 animate-pulse rounded bg-base-200" />
                </li>
              ))}
            </ul>
          ) : searchResult.cafes.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-base-content/55">
              找不到符合條件的咖啡店
            </p>
          ) : (
            <ul
              ref={searchListRefCallback}
              onScroll={handleSearchListScroll}
              className="flex-1 divide-y divide-base-content/10 overflow-y-auto"
            >
              {searchResult.cafes.map((c) => (
                <li key={c.id} data-cafe-id={c.id} data-cafe-slug={c.slug ?? undefined}>
                  <CafeListItem cafe={c} active={c.id === activeMarkerId} sortKey={sortKey} />
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }
    // idle (home + 無 filter)
    return (
      <IdleSheetContent
        cafes={idleRecommendations}
        isLoading={allCafes.isLoading}
        isError={allCafes.isError}
        listRef={idleListRefCallback}
        onScroll={handleIdleListScroll}
      />
    );
  };

  const drawerTitle = isDetailMode
    ? `${detailCafe?.name ?? "咖啡店"}詳細資訊`
    : tab === "pocket"
    ? "口袋名單"
    : tab === "profile"
    ? "個人"
    : searchMode === "results"
    ? "搜尋結果"
    : "附近推薦";

  return (
    <div className="flex h-full flex-col bg-base-100">
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <CafeMap
            cafes={mapCafes}
            activeId={effectiveActiveId}
            userLocation={userLocation}
            paddingBottom={sheetPaddingPx}
            fitToCafesKey={tab !== "home" ? `tab:${tab}:${activePocketId ?? ""}` : null}
            onMarkerClick={handleMarkerClick}
            onMapClick={handleMapClick}
            hideZoomButtons
            hideLocateButton={currentRatio > 0.3 || isSearching}
          />
        </div>

        {/* 浮動搜尋層 — 僅 home tab 非 detail 時顯示 */}
        {showMapSearchOverlay && (
          <MapSearchOverlay
            mode={searchMode}
            query={query}
            onQueryChange={setQuery}
            selected={selected}
            onToggleTag={toggle}
            onFocusSearch={() => {
              if (isDetailMode) {
                navigate("/");
              }
              setIsSearching(true);
            }}
            onBack={handleOverlayBack}
            onClearAll={handleOverlayClear}
            onSubmit={handleSubmitSearch}
            keyword={keyword}
            scenario={scenario}
          />
        )}

        {/* Vaul Drawer — 底部 sheet。home/pocket/profile/detail 都用它。
            modal=false 保留地圖互動;dismissible=false 避免使用者誤拉到底。 */}
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
              data-sheet-at-bottom={!isAtMaxSnap ? "true" : "false"}
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
              onTouchCancel={handleSheetTouchEnd}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest("button, a, input, select, textarea, [role='button']")) {
                  return;
                }
                if (isDetailMode) {
                  if (snap !== 0.85) {
                    setSnap(0.85);
                  }
                } else if (tab === "home" || tab === "pocket") {
                  if (snap !== 0.7) {
                    setSnap(0.7);
                  }
                }
              }}
              className={`fixed inset-x-0 bottom-0 z-20 flex h-full flex-col rounded-t-xl border-t border-base-content/10 bg-base-100 ${drawerBottomPad} shadow-2xl outline-none`}
            >
              <Drawer.Title className="sr-only">{drawerTitle}</Drawer.Title>
              <Drawer.Description className="sr-only">
                {isDetailMode ? "向下拖曳可關閉,或點右上角的關閉按鈕" : "可上下拖曳調整面板高度"}
              </Drawer.Description>
              <Drawer.Handle className="!mt-1.5 !mb-0 !h-1 !w-9 !bg-base-content/30" />

              {renderDrawerContent()}
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>

        {/* Searching 全屏 overlay — 蓋住 drawer,只露浮動搜尋框。
            點 scenarios / 套用後關閉。z 介於 search overlay (z-40) 與 drawer (z-20) 之間,
            但需要遮住 drawer,所以用 z-30,並從搜尋框下方開始(top padding ≈ search 高度)。 */}
        {isSearching && tab === "home" && !isDetailMode && (
          <div className="absolute inset-0 z-30 flex flex-col bg-base-100 pt-[100px]">
            <SearchingSheetContent
              selected={selected}
              onToggleTag={toggle}
              openAt={openAt}
              onOpenAtChange={setOpenAt}
              radiusM={radiusM}
              onRadiusMChange={setRadiusM}
              scenarioKey={scenario}
              onPickScenario={(s: Scenario) => {
                pickScenario(s);
                setIsSearching(false);
              }}
              onApply={() => setIsSearching(false)}
            />
          </div>
        )}
      </div>

      {showTabBar && <MobileTabBar />}

      <MobileChoiceSheet
        isOpen={isSortOpen}
        onClose={() => setIsSortOpen(false)}
        title="選擇排序方式"
        value={sortKey}
        options={SORT_OPTIONS_MOBILE}
        onChange={setSortKey}
      />

      {isDetailMode && <CafeActionModals actions={actions} />}
    </div>
  );
}
