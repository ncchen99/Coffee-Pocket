import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { Cap, CustomSelect, ConfirmModal } from "@/components/primitives";
import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences, useUpdateUserPreferences } from "@/hooks/useProfile";
import { exportPocketsJSON } from "@/lib/api";

function applyTheme(themeVal: string) {
  if (themeVal === "light") {
    document.documentElement.setAttribute("data-theme", "coffee-paper");
    localStorage.setItem("cp.theme", "coffee-paper");
  } else if (themeVal === "dark") {
    document.documentElement.setAttribute("data-theme", "coffee-roast");
    localStorage.setItem("cp.theme", "coffee-roast");
  } else {
    localStorage.removeItem("cp.theme");
    const prefer = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "coffee-roast"
      : "coffee-paper";
    document.documentElement.setAttribute("data-theme", prefer);
  }
}

/**
 * 設定頁 — 支援手機版佈局，搭載客製化下拉選單與直角極簡登出確認 Modal。
 */
export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  // 狀態管理與持久化(已登入優先讀 DB,fallback 到 localStorage)
  const [themeVal, setThemeVal] = useState(() => localStorage.getItem("cp.settings.theme") ?? "system");
  const [distance, setDistance] = useState(() => localStorage.getItem("cp.settings.distance") ?? "3");
  const [view, setView] = useState(() => localStorage.getItem("cp.settings.view") ?? "map");
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { data: prefs } = useUserPreferences(user?.id ?? null);
  const updatePrefs = useUpdateUserPreferences();

  // 首次從 DB 載入時 mirror 到本地 state + theme
  useEffect(() => {
    if (!prefs) return;
    if (prefs.theme) {
      setThemeVal(prefs.theme);
      localStorage.setItem("cp.settings.theme", prefs.theme);
      applyTheme(prefs.theme);
    }
    if (prefs.default_distance_km != null) {
      setDistance(String(prefs.default_distance_km));
      localStorage.setItem("cp.settings.distance", String(prefs.default_distance_km));
    }
    if (prefs.default_view) {
      setView(prefs.default_view);
      localStorage.setItem("cp.settings.view", prefs.default_view);
    }
  }, [prefs]);

  const persistToDb = (patch: Parameters<typeof updatePrefs.mutate>[0]["prefs"]) => {
    if (!user) return;
    updatePrefs.mutate({ userId: user.id, prefs: patch });
  };

  const handleThemeChange = (val: string) => {
    setThemeVal(val);
    localStorage.setItem("cp.settings.theme", val);
    applyTheme(val);
    persistToDb({ theme: val as "system" | "light" | "dark" });
  };

  const handleDistanceChange = (val: string) => {
    setDistance(val);
    localStorage.setItem("cp.settings.distance", val);
    persistToDb({ default_distance_km: Number(val) });
  };

  const handleViewChange = (val: string) => {
    setView(val);
    localStorage.setItem("cp.settings.view", val);
    persistToDb({ default_view: val as "map" | "list" });
  };

  const handleConfirmLogout = () => {
    signOut();
  };

  const handleExportPockets = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportPocketsJSON();
    } catch (e) {
      alert("匯出失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-base-100">
      <header className="navbar sticky top-0 z-30 min-h-12 border-b border-base-content/10 bg-base-100/95 px-2 backdrop-blur">
        <div className="navbar-start">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn btn-ghost btn-sm btn-square rounded-none"
            aria-label="返回"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="navbar-center">
          <h1 className="text-sm font-semibold text-base-content">設定</h1>
        </div>
        <div className="navbar-end" />
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* 外觀 */}
        <section className="px-5 pt-5">
          <Cap>外觀</Cap>
          <div className="mt-3">
            <SettingRow label="主題">
              <CustomSelect
                options={[
                  { value: "system", label: "系統" },
                  { value: "light", label: "淺色" },
                  { value: "dark", label: "深色" }
                ]}
                value={themeVal}
                onChange={handleThemeChange}
                widthClass="w-36"
              />
            </SettingRow>
          </div>
        </section>

        <div className="divider mx-5 my-4" />

        {/* 搜尋預設 */}
        <section className="px-5">
          <Cap>搜尋預設</Cap>
          <div className="mt-3 space-y-4">
            <SettingRow label="預設距離">
              <CustomSelect
                options={[
                  { value: "1", label: "1 km" },
                  { value: "3", label: "3 km" },
                  { value: "5", label: "5 km" },
                  { value: "10", label: "10 km" }
                ]}
                value={distance}
                onChange={handleDistanceChange}
                widthClass="w-28"
              />
            </SettingRow>
            <SettingRow label="預設顯示">
              <CustomSelect
                options={[
                  { value: "map", label: "地圖" },
                  { value: "list", label: "列表" }
                ]}
                value={view}
                onChange={handleViewChange}
                widthClass="w-28"
              />
            </SettingRow>
          </div>
        </section>

        <div className="divider mx-5 my-4" />

        {/* 帳號 */}
        <section className="px-5">
          <Cap>帳號</Cap>
          <div className="mt-3">
            {user ? (
              <SettingRow label="目前帳號">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-base-content/70">{user.email}</span>
                  <button
                    type="button"
                    onClick={() => setIsLogoutModalOpen(true)}
                    className="btn btn-neutral btn-sm rounded-none font-medium px-4 h-8 min-h-8 text-xs"
                  >
                    登出
                  </button>
                </div>
              </SettingRow>
            ) : (
              <SettingRow label="帳號狀態">
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="btn btn-neutral btn-sm rounded-none font-medium px-4 h-8 min-h-8 text-xs"
                >
                  登入
                </button>
              </SettingRow>
            )}
          </div>
        </section>

        {user && (
          <>
            <div className="divider mx-5 my-4" />
            {/* 資料 */}
            <section className="px-5">
              <Cap>資料</Cap>
              <div className="mt-3">
                <SettingRow label="匯出我的口袋">
                  <button
                    type="button"
                    onClick={handleExportPockets}
                    disabled={isExporting}
                    className="btn btn-neutral btn-sm rounded-none font-medium px-4 h-8 min-h-8 text-xs disabled:opacity-50"
                  >
                    {isExporting ? "匯出中…" : "下載 JSON"}
                  </button>
                </SettingRow>
              </div>
            </section>
          </>
        )}

        <div className="divider mx-5 my-4" />

        {/* 關於 */}
        <section className="px-5 pb-10">
          <Cap>關於</Cap>
          <div className="mt-3 space-y-1 text-sm text-base-content/55">
            <p>版本 0.0.1</p>
            <p>咖啡口袋 · Coffee Pocket</p>
          </div>
        </section>
      </main>

      {/* 登出確認 Modal */}
      <ConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
        title="確認登出"
        message="您確定要登出您的咖啡口袋帳號嗎？登出後將無法同步您的收藏與口袋名單。"
        confirmText="確認登出"
        cancelText="取消"
        confirmButtonClass="btn-error"
      />
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-base-content">{label}</span>
      {children}
    </div>
  );
}
