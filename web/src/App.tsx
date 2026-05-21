import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useMatch, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, AlertCircleIcon } from "@hugeicons/core-free-icons";
import { useIsDesktop } from "@/components/layout/Responsive";
import { Topbar } from "@/components/layout/Topbar";
import { CafeMap } from "@/components/search/CafeMap";
import { SearchSidebar, type SortKey } from "@/components/search/SearchSidebar";
import { CafeDetailContent } from "@/components/cafe/CafeDetailContent";
import { CafeActionModals } from "@/components/cafe/CafeActionModals";
import { DesktopFilterPanel } from "@/components/search/DesktopFilterPanel";
import { useSearchSelection } from "@/hooks/useSearchSelection";
import { useCafeSearch, useCafeDetail } from "@/hooks/useCafes";
import { usePocketItems } from "@/hooks/usePockets";
import { useCafeActions } from "@/hooks/useCafeActions";
import { useUserLocation } from "@/context/UserLocationContext";
import { haversineKm } from "@/lib/format";
import HomePage from "./pages/HomePage";
import MapPage from "./pages/MapPage";
import CafeDetailPage from "./pages/CafeDetailPage";
import LoginPage from "./pages/LoginPage";
import PocketListPage from "./pages/PocketListPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import FilterPage from "./pages/FilterPage";
import OnboardingPage, { isOnboarded } from "./pages/OnboardingPage";
import DesktopProfilePage from "./pages/DesktopProfilePage";
import DesktopPocketPage from "./pages/DesktopPocketPage";
import DesktopSettingsPage from "./pages/DesktopSettingsPage";
export default function App() {
  const isDesktop = useIsDesktop();
  // 訂閱 location 以強制 App 在每次路由切換時 re-render —— 否則 `isOnboarded()`
  // 只在 mount 時呼叫一次,Route element 把舊的 <Navigate to="/onboarding"> 物件
  // 釘住,完成 onboarding 後跳轉到 "/" 仍會被推回 /onboarding。
  useLocation();

  if (isDesktop) {
    return (
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/login" element={isOnboarded() ? <LoginPage /> : <Navigate to="/onboarding" replace />} />
        <Route path="/profile" element={isOnboarded() ? <DesktopProfilePage /> : <Navigate to="/onboarding" replace />} />
        <Route path="/settings" element={isOnboarded() ? <DesktopSettingsPage /> : <Navigate to="/onboarding" replace />} />
        <Route path="/pocket" element={isOnboarded() ? <DesktopPocketPage /> : <Navigate to="/onboarding" replace />} />
        <Route path="*" element={isOnboarded() ? <DesktopApp /> : <Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/" element={isOnboarded() ? <HomePage /> : <Navigate to="/onboarding" replace />} />
      <Route path="/map" element={isOnboarded() ? <MapPage /> : <Navigate to="/onboarding" replace />} />
      <Route path="/filter" element={isOnboarded() ? <FilterPage /> : <Navigate to="/onboarding" replace />} />
      <Route path="/cafe/:slug" element={isOnboarded() ? <CafeDetailPage /> : <Navigate to="/onboarding" replace />} />
      <Route path="/login" element={isOnboarded() ? <LoginPage /> : <Navigate to="/onboarding" replace />} />
      <Route path="/pocket" element={isOnboarded() ? <PocketListPage /> : <Navigate to="/onboarding" replace />} />
      <Route path="/profile" element={isOnboarded() ? <ProfilePage /> : <Navigate to="/onboarding" replace />} />
      <Route path="/settings" element={isOnboarded() ? <SettingsPage /> : <Navigate to="/onboarding" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
  const [sortKey, setSortKey] = useState<SortKey>("distance");
  // 中間欄轉場期間覆蓋一層模糊遮罩,避免 Mapbox 寬度漸變時的視覺跳動。
  // 轉場結束後再 fade out。
  const [isPanelAnimating, setIsPanelAnimating] = useState(false);

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

  useEffect(() => {
    setIsPanelAnimating(true);
    const t = window.setTimeout(() => setIsPanelAnimating(false), 320);
    return () => window.clearTimeout(t);
  }, [isPanelOpen]);

  const searchQuery = useCafeSearch({
    tags: Array.from(selected),
    tags_or: orSelected,
    lng: location?.lng ?? null,
    lat: location?.lat ?? null,
    radius_m: radiusM ?? undefined,
    sort: sortKey,
    open_at: openAt,
    limit: 1000,
    q: keyword,
  });
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
  //   咖啡色圖標 —— 無法定位、無法 highlight。把 detail 抓回來的那筆塞進
  //   cafes 尾端,讓 CafeMap 建出 marker,後續 active highlight 才有作用。
  const cafes =
    cafe && !baseCafes.some((c) => c.id === cafe.id)
      ? [
          ...baseCafes,
          location
            ? { ...cafe, distance_km: haversineKm(location, { lng: cafe.lng, lat: cafe.lat }) }
            : cafe,
        ]
      : baseCafes;
  const totalCount = isPocketMode ? pocketCafes.length : (searchQuery.data?.total ?? 0);

  // 把 URL 上的 ident (slug / UUID) 對到 cafes 列表中的 UUID,
  // 讓 CafeMap / SearchSidebar 的 active 比對仍走 cafe.id。
  const activeId =
    cafes.find((c) => c.slug === activeIdent || c.id === activeIdent)?.id ?? activeIdent;
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
        <div
          className={`relative shrink-0 overflow-hidden bg-base-100 transition-[width,opacity] duration-300 ease-out ${
            isPanelOpen
              ? "w-[32%] min-w-[360px] xl:w-[29%] xl:min-w-[340px] 2xl:w-[27%] 2xl:min-w-[320px] border-r border-base-content/10 opacity-100"
              : "w-0 min-w-0 opacity-0"
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
                onClose={() => navigate("/")}
                onApply={() => navigate("/")}
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
                onClick={() => navigate("/")}
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
        <section className="relative flex-1 overflow-hidden">
          <CafeMap
            cafes={cafes}
            activeId={activeId}
            userLocation={location}
            fitToCafesKey={isPocketMode ? `pocket:${pocketId}` : null}
            onMarkerClick={(mid) => {
              const c = cafes.find((x) => x.id === mid);
              navigate(`/cafe/${c?.slug ?? mid}`);
            }}
          />
          {/* 中間欄展開 / 收合期間,地圖容器寬度同步漸變,Mapbox 會逐幀 resize +
              reproject —— 視覺上像是「畫面跳動」。蓋一層模糊覆蓋層在轉場期間
              遮住跳動,等寬度穩定 (~320ms) 再淡出,避免眼睛抓不到參考點。 */}
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 bg-base-100/40 backdrop-blur-md transition-opacity duration-300 ease-out ${
              isPanelAnimating ? "opacity-100" : "opacity-0"
            }`}
          />
        </section>
      </div>
      <CafeActionModals actions={actions} />
    </div>
  );
}
