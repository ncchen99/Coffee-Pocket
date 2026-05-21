import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useMatch, useNavigate } from "react-router-dom";
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
import { useCafeActions } from "@/hooks/useCafeActions";
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

// 預設定位:臺南車站附近,等到接上 geolocation 之後再以 user 位置覆蓋。
const DEFAULT_LNG = 120.205;
const DEFAULT_LAT = 22.991;
// 半徑放寬到 ~30km,確保安平、東區、北區、永康、仁德等行政區的咖啡廳都會被收進來。
// 真正的「附近」會在 geolocation 接上後縮回 5km。
const DEFAULT_RADIUS_M = 30000;

export default function App() {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/profile" element={<DesktopProfilePage />} />
        <Route path="/settings" element={<DesktopSettingsPage />} />
        <Route path="/pocket" element={<DesktopPocketPage />} />
        <Route path="*" element={<DesktopApp />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={isOnboarded() ? <HomePage /> : <Navigate to="/onboarding" replace />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/filter" element={<FilterPage />} />
      <Route path="/cafe/:id" element={<CafeDetailPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/pocket" element={<PocketListPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
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
  const cafeMatch = useMatch("/cafe/:id");
  const filterMatch = useMatch("/filter");
  const navigate = useNavigate();
  const activeId = cafeMatch?.params.id ?? null;
  const isFilterOpen = !!filterMatch;

  const { selected, orSelected, toggle, setAll, query, setQuery, scenario, pickScenario, openAt, setOpenAt } =
    useSearchSelection();

  // displayed 落後 activeId —— 關閉時讓內容多停留 280ms 給 exit 動畫播完。
  const [displayed, setDisplayed] = useState<string | null>(activeId);
  const [isScrolled, setIsScrolled] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("distance");

  useEffect(() => {
    if (activeId) {
      setDisplayed(activeId);
      return;
    }
    const t = window.setTimeout(() => setDisplayed(null), 280);
    return () => window.clearTimeout(t);
  }, [activeId]);

  useEffect(() => {
    setIsScrolled(false);
  }, [activeId]);

  const isPanelOpen = !!activeId || isFilterOpen;

  const searchQuery = useCafeSearch({
    tags: Array.from(selected),
    tags_or: orSelected,
    lng: DEFAULT_LNG,
    lat: DEFAULT_LAT,
    radius_m: DEFAULT_RADIUS_M,
    sort: sortKey,
    open_at: openAt,
  });
  const cafes = searchQuery.data?.cafes ?? [];
  const totalCount = searchQuery.data?.total ?? 0;

  const detailQuery = useCafeDetail(displayed);
  const cafe = detailQuery.data ?? null;
  const actions = useCafeActions(displayed);

  return (
    <div className="flex h-screen flex-col bg-base-100">
      <Topbar variant="desktop" />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-[28%] min-w-[400px] shrink-0">
          <SearchSidebar
            activeId={activeId}
            selected={selected}
            toggle={toggle}
            setAll={setAll}
            query={query}
            setQuery={setQuery}
            scenario={scenario}
            pickScenario={pickScenario}
            cafes={cafes}
            totalCount={totalCount}
            isLoading={searchQuery.isLoading}
            isError={searchQuery.isError}
            sortKey={sortKey}
            onSortChange={setSortKey}
            openAt={openAt}
            onOpenAtChange={setOpenAt}
          />
        </div>
        <div
          className={`relative shrink-0 overflow-hidden bg-base-100 transition-[width,opacity] duration-300 ease-out ${
            isPanelOpen
              ? "w-[32%] min-w-[380px] border-r border-base-content/10 opacity-100"
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
                }}
                onClose={() => navigate("/")}
                onApply={() => navigate("/")}
                openAt={openAt}
                onOpenAtChange={setOpenAt}
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
            onMarkerClick={(mid) => navigate(`/cafe/${mid}`)}
          />
        </section>
      </div>
      <CafeActionModals actions={actions} />
    </div>
  );
}
