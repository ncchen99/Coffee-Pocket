import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Navigate, useMatch, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, AlertCircleIcon, CheckmarkCircle02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { globalProgress, type ProgressState } from "@/lib/api";
import { useIsDesktop } from "@/components/layout/Responsive";
import { Topbar } from "@/components/layout/Topbar";
import { CafeMap } from "@/components/search/CafeMap";
import { SearchSidebar, type SortKey } from "@/components/search/SearchSidebar";
import { CafeDetailContent } from "@/components/cafe/CafeDetailContent";
import { CafeActionModals } from "@/components/cafe/CafeActionModals";
import { DesktopFilterPanel } from "@/components/search/DesktopFilterPanel";
import { useSearchSelection } from "@/hooks/useSearchSelection";
import { useAllCafes, useCafeDetail } from "@/hooks/useCafes";
import { searchCafesLocal } from "@/lib/cafeFilter";
import { usePocketItems } from "@/hooks/usePockets";
import { useCafeActions } from "@/hooks/useCafeActions";
import { useUserLocation } from "@/context/UserLocationContext";
import { haversineKm } from "@/lib/format";
import MapPage from "./pages/MapPage";
import LoginPage from "./pages/LoginPage";
import SettingsPage from "./pages/SettingsPage";
import OnboardingPage, { isOnboarded } from "./pages/OnboardingPage";
import DesktopProfilePage from "./pages/DesktopProfilePage";
import DesktopPocketPage from "./pages/DesktopPocketPage";
import DesktopSettingsPage from "./pages/DesktopSettingsPage";
import AddCafePage from "./pages/AddCafePage";
export default function App() {
  const isDesktop = useIsDesktop();
  // 訂閱 location 以強制 App 在每次路由切換時 re-render —— 否則 `isOnboarded()`
  // 只在 mount 時呼叫一次,Route element 把舊 hometown <Navigate to="/onboarding"> 物件
  // 釘住,完成 onboarding 後跳轉到 "/" 仍會被推回 /onboarding。
  useLocation();

  // 全域新增咖啡廳進度
  const [progressState, setProgressState] = useState<ProgressState>({ progress: null, success: null, error: null });
  const [showProgress, setShowProgress] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    globalProgress.subscribe((state) => {
      setProgressState(state);
      if (state.progress || state.success || state.error) {
        setShowProgress(true);

        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
        }

        // 手機版：每當狀態有更新，只顯示 2 秒（成功或失敗顯示 3 秒）以避免長時間遮擋 navigation bar
        const duration = (state.success || state.error) ? 3000 : 2000;
        hideTimerRef.current = setTimeout(() => {
          setShowProgress(false);
          if (state.success || state.error) {
            setTimeout(() => {
              globalProgress.update({ progress: null, success: null, error: null });
            }, 300);
          }
        }, duration);
      }
    });
    return () => {
      globalProgress.unsubscribe();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const progressUI = useMemo(() => {
    if (!showProgress) return null;

    const isSuccess = !!progressState.success;
    const isError = !!progressState.error;
    const text = progressState.progress || progressState.success || progressState.error || "";

    return (
      <div className={`fixed bottom-0 left-0 right-0 z-50 w-full px-4 py-4 shadow-2xl flex items-center justify-between gap-3 border-t border-base-content/10 transition-transform duration-300 ${
        isSuccess ? "bg-success text-success-content" : isError ? "bg-error text-error-content" : "bg-base-content text-base-100"
      }`}
      style={{
        paddingBottom: isDesktop ? "1rem" : "calc(1.1rem + env(safe-area-inset-bottom))",
        animation: "slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards"
      }}>
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>
        <div className="flex items-center gap-3">
          {!isSuccess && !isError ? (
            <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin text-inherit shrink-0" />
          ) : isSuccess ? (
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} className="text-inherit shrink-0" />
          ) : (
            <HugeiconsIcon icon={AlertCircleIcon} size={16} className="text-inherit shrink-0" />
          )}
          <span className="text-sm font-medium">{text}</span>
        </div>
      </div>
    );
  }, [showProgress, progressState, isDesktop]);

  if (isDesktop) {
    return (
      <>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/login" element={isOnboarded() ? <LoginPage /> : <Navigate to="/onboarding" replace />} />
          <Route path="/profile" element={isOnboarded() ? <DesktopProfilePage /> : <Navigate to="/onboarding" replace />} />
          <Route path="/settings" element={isOnboarded() ? <DesktopSettingsPage /> : <Navigate to="/onboarding" replace />} />
          <Route path="/pocket" element={isOnboarded() ? <DesktopPocketPage /> : <Navigate to="/onboarding" replace />} />
          <Route path="/add-cafe" element={isOnboarded() ? <AddCafePage /> : <Navigate to="/onboarding" replace />} />
          <Route path="*" element={isOnboarded() ? <DesktopApp /> : <Navigate to="/onboarding" replace />} />
        </Routes>
        {progressUI}
      </>
    );
  }

  // 手機端 / /map /pocket /profile /cafe/:slug /filter 全部由 MapPage 統一渲染
  //（單一 shell 內依 pathname 衍生 tab,內部用 state 切換 idle/searching/results）。
  // 只剩需要全螢幕 / 獨立流程的頁面 (login / settings / onboarding) 走獨立 route。
  return (
    <>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/login" element={isOnboarded() ? <LoginPage /> : <Navigate to="/onboarding" replace />} />
        <Route path="/settings" element={isOnboarded() ? <SettingsPage /> : <Navigate to="/onboarding" replace />} />
        <Route path="/add-cafe" element={isOnboarded() ? <AddCafePage /> : <Navigate to="/onboarding" replace />} />
        <Route path="*" element={isOnboarded() ? <MapPage /> : <Navigate to="/onboarding" replace />} />
      </Routes>
      {progressUI}
    </>
  );
}

/**
 * 桌面共用 shell —— Topbar + SearchSidebar + (中間詳細欄) + CafeMap。
 *
 * 為什麼不用獨立路由?
 *   原本 `/` 與 `/cafe/:id` 是兩個 page,切換時 CafeMap 會 unmount→重新 init
 *   (style/tiles 重抓),視覺上是一次明顯閃動。把 desktop 收進同一個元件,
 *   CafeMap 從不卸載,寬度變化交給 ResizeObserver 平滑 resize,中間欄的開合
 *   只靠 width transition + slide/fade 動畫。activeId 來源是 URL match,
 *   保留可分享 / 後退鍵原本的行為。
 */
function DesktopApp() {
  const cafeMatch = useMatch("/cafe/:slug");
  const filterMatch = useMatch("/filter");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pocketId = searchParams.get("pocket");
  const isPocketMode = !!pocketId;
  // URL 帶的是 slug (相容舊書籤也接受 UUID)。對下游元件（CafeMap / Sidebar）
  // 而言它們只關心「目前選中的那筆 cafe」的識別字串,所以這裡先保留 slug,
  // 在拿到 cafes 後再 resolve 出對應 UUID 給 marker / list item 做 active 比對。
  const activeIdent = cafeMatch?.params.slug ?? null;
  const isFilterOpen = !!filterMatch;

  const { selected, orSelected, toggle, setAll, setOrSelected, query, setQuery, scenario, pickScenario, openAt, setOpenAt, radiusM, setRadiusM, keyword, setKeyword } =
    useSearchSelection();

  // displayed 落後 activeIdent —— 關閉時讓內容多停留 280ms 給 exit 動畫播完。
  const [displayed, setDisplayed] = useState<string | null>(activeIdent);
  const [isScrolled, setIsScrolled] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("smart");

  useEffect(() => {
    if (activeIdent) {
      setDisplayed(activeIdent);
      return;
    }
    const t = window.setTimeout(() => setDisplayed(null), 280);
    return () => window.clearTimeout(t);
  }, [activeIdent]);

  useEffect(() => {
    setIsScrolled(false);
  }, [activeIdent]);

  const { location } = useUserLocation();
  const isPanelOpen = !!activeIdent || isFilterOpen;

  // 中間欄改用「絕對定位 + translate-x 滑入」的覆蓋層,而不是 flex sibling 推擠
  // CafeMap 寬度。原本 width transition 會讓 Mapbox 容器每幀 resize + reproject,
  // 視覺上像是地圖整片在跳動 / 閃爍;改成 overlay 後地圖寬度恆定,完全不會 resize。
  // 為了讓「選中咖啡廳 flyTo」仍把 marker 對在可見區域中心,
  // 量出覆蓋層的實際寬度並當作 paddingLeft 餵給 CafeMap。
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => setPanelWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mapPaddingLeft = isPanelOpen ? panelWidth : 0;

  // 全量資料 → 本地 filter。改用 useMemo 是因為 selected 是 Set，
  // 每次 render 參考都會變，但 Array.from 後內容才是 hook 真正的 dep。
  const allCafes = useAllCafes();
  const tagsArr = Array.from(selected);
  const tagsKey = tagsArr.join(",");
  const orKey = orSelected.join(",");
  // 即時 keyword：優先用 query（使用者正在輸入），其次才用 AI 解析時 set 的 keyword。
  const liveKeyword = query.trim() || keyword || null;
  const searchResult = useMemo(() => {
    const cafes = searchCafesLocal(allCafes.data, {
      tags: tagsArr,
      tagsOr: orSelected,
      userLng: location?.lng ?? null,
      userLat: location?.lat ?? null,
      radiusM,
      openAt,
      q: liveKeyword,
      sort: sortKey,
    });
    return { cafes, total: cafes.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCafes.data, tagsKey, orKey, location?.lng, location?.lat, radiusM, openAt, liveKeyword, sortKey]);
  const searchQuery = {
    data: searchResult,
    isLoading: allCafes.isLoading,
    isError: allCafes.isError,
  };
  // Pocket 模式 —— ?pocket=<id>。直接用 pocket items 取代 search 結果,
  // 並讓 CafeMap 透過 fitToCafesKey 把鏡頭帶到這批點上。
  const pocketItemsQuery = usePocketItems(pocketId);
  const pocketCafes = (pocketItemsQuery.data ?? [])
    .map((item) => item.cafe)
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) =>
      // pocket items 沒有 PostGIS 算好的距離,client-side 用 haversine 補,
      // 否則 SearchSidebar 顯示「距離 ↓」但每筆都是 0 公尺。
      location
        ? { ...c, distance_km: haversineKm(location, { lng: c.lng, lat: c.lat }) }
        : c,
    )
    .sort((a, b) => (location ? a.distance_km - b.distance_km : 0));
  const baseCafes = isPocketMode ? pocketCafes : (searchQuery.data?.cafes ?? []);

  const detailQuery = useCafeDetail(displayed);
  const cafe = detailQuery.data ?? null;

  // 確保被選中的咖啡廳(從 URL slug 解析)一定有 marker 可顯示。
  //   情境:從口袋名單點某家店進 /cafe/:slug,但這家店可能不在 searchQuery
  //   的當前結果裡(被 tag/距離/keyword 過濾掉),也不在 pocketCafes 裡(沒帶
  //   pocket 參數時)。如果不補,使用者會看到右側詳細欄,但地圖上沒有對應的
  //   咖啡色圖標 —— 無法定位、無法 highlight。
  //
  //   重要:這個「補上 detail」只給 *地圖* 用,不能塞進 sidebar 列表 ——
  //   否則使用者搜尋時，被打開的詳細頁那家會混在搜尋結果裡誤導人。
  const mapCafes =
    cafe && !baseCafes.some((c) => c.id === cafe.id)
      ? [
          ...baseCafes,
          location
            ? { ...cafe, distance_km: haversineKm(location, { lng: cafe.lng, lat: cafe.lat }) }
            : cafe,
        ]
      : baseCafes;
  const cafes = baseCafes; // sidebar 用的乾淨列表
  const totalCount = isPocketMode ? pocketCafes.length : (searchQuery.data?.total ?? 0);

  // 在 pocket 模式下,所有導航都要把 ?pocket=<id> 帶著走 —— 點 marker 進詳細
  // 頁不能掉 query string,否則 useSearchParams 抓不到 pocketId,
  // 整個列表就會切回 search 模式、跑出非口袋裡的店。
  const pocketSearch = isPocketMode ? `?pocket=${encodeURIComponent(pocketId!)}` : "";
  const cafePath = (slugOrId: string) => `/cafe/${slugOrId}${pocketSearch}`;
  const homePath = `/${pocketSearch}`;

  // 把 URL 上的 ident (slug / UUID) 對到 cafes 列表中的 UUID,
  // 讓 CafeMap / SearchSidebar 的 active 比對仍走 cafe.id。
  // 用 mapCafes 而不是 cafes — 才能涵蓋「不在搜尋結果但開了詳細頁」的情況。
  const activeId =
    mapCafes.find((c) => c.slug === activeIdent || c.id === activeIdent)?.id ?? activeIdent;
  const actions = useCafeActions(cafe?.id ?? null);

  return (
    <div className="flex h-screen flex-col bg-base-100">
      <Topbar variant="desktop" />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex lg:w-[26%] lg:min-w-[380px] xl:w-[25%] xl:min-w-[360px] 2xl:w-[24%] 2xl:min-w-[340px] shrink-0">
          <SearchSidebar
            activeId={activeId}
            selected={selected}
            toggle={toggle}
            setAll={setAll}
            setOrSelected={setOrSelected}
            query={query}
            setQuery={setQuery}
            scenario={scenario}
            pickScenario={pickScenario}
            cafes={cafes}
            totalCount={totalCount}
            isLoading={isPocketMode ? pocketItemsQuery.isLoading : searchQuery.isLoading}
            isError={isPocketMode ? pocketItemsQuery.isError : searchQuery.isError}
            sortKey={sortKey}
            onSortChange={setSortKey}
            openAt={openAt}
            onOpenAtChange={setOpenAt}
            radiusM={radiusM}
            onRadiusMChange={setRadiusM}
            keyword={keyword}
            onKeywordChange={setKeyword}
          />
        </div>
        <section className="relative flex-1 overflow-hidden">
          <CafeMap
            cafes={mapCafes}
            activeId={activeId}
            userLocation={location}
            paddingLeft={mapPaddingLeft}
            fitToCafesKey={isPocketMode ? `pocket:${pocketId}` : null}
            onMarkerClick={(mid) => {
              const c = mapCafes.find((x) => x.id === mid);
              navigate(cafePath(c?.slug ?? mid));
            }}
          />
          {/* 詳細欄 / 篩選欄做成絕對定位的覆蓋層,從地圖區左側滑入。
              CafeMap 的容器寬度全程不變,Mapbox 不會 resize/reproject,
              因此沒有「畫面閃爍」的問題。aria-hidden 在收起時關閉互動。 */}
          <div
            ref={panelRef}
            aria-hidden={!isPanelOpen}
            className={`absolute inset-y-0 left-0 z-10 w-[38%] min-w-[400px] xl:w-[35%] xl:min-w-[380px] 2xl:w-[33%] 2xl:min-w-[360px] overflow-hidden border-r border-base-content/10 bg-base-100 shadow-lg transition-transform duration-300 ease-out ${
              isPanelOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
            }`}
          >
            {isFilterOpen ? (
              <div className="cp-anim-slide-in h-full">
                <DesktopFilterPanel
                  selected={selected}
                  onToggle={toggle}
                  onReset={() => {
                    setAll([]);
                    setOpenAt(null);
                    setRadiusM(null);
                  }}
                  onClose={() => navigate(homePath)}
                  onApply={() => navigate(homePath)}
                  openAt={openAt}
                  onOpenAtChange={setOpenAt}
                  radiusM={radiusM}
                  onRadiusMChange={setRadiusM}
                />
              </div>
            ) : detailQuery.isLoading && displayed ? (
              <div className="cp-anim-slide-in h-full p-6 space-y-3">
                <div className="h-40 bg-base-200 animate-pulse rounded" />
                <div className="h-6 bg-base-200 animate-pulse rounded w-1/2" />
                <div className="h-4 bg-base-200 animate-pulse rounded w-3/4" />
                <div className="h-20 bg-base-200 animate-pulse rounded" />
              </div>
            ) : cafe ? (
              <div key={cafe.id} className="cp-anim-slide-in relative h-full flex flex-col">
                <button
                  type="button"
                  onClick={() => navigate(homePath)}
                  aria-label="關閉"
                  className={`btn btn-ghost btn-sm btn-square absolute right-4 top-4 z-20 transition-all duration-200 ${
                    isScrolled
                      ? "bg-base-100 text-base-content opacity-100 shadow-md border border-base-content/10"
                      : "bg-base-100/40 text-base-content/70 opacity-60 hover:opacity-100 hover:bg-base-100/60 backdrop-blur"
                  }`}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
                </button>
                <div
                  className="flex-1 overflow-y-auto"
                  onScroll={(e) => {
                    setIsScrolled(e.currentTarget.scrollTop >= 10);
                  }}
                >
                  <CafeDetailContent cafe={cafe} isDesktop={true} actions={actions} />
                </div>
              </div>
            ) : displayed ? (
              <div className="flex h-full items-center justify-center p-6">
                <div role="alert" className="alert alert-warning max-w-sm">
                  <HugeiconsIcon icon={AlertCircleIcon} size={18} strokeWidth={1.5} />
                  <span>{detailQuery.isError ? "載入失敗，請稍後再試" : "找不到這間店"}</span>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
      <CafeActionModals actions={actions} />
    </div>
  );
}
