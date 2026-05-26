import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cap, CustomSelect, ConfirmModal } from "@/components/primitives";
import { DesktopPageLayout } from "@/components/layout/DesktopPageLayout";
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
 * 桌面版設定頁 — 採用 DesktopPageLayout 呈現，且符合直角極簡風格。
 */
export default function DesktopSettingsPage() {
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
    <DesktopPageLayout>
      {/* Header */}
      <div className="flex items-baseline justify-between pb-5 border-b border-base-content/10 mb-6">
        <div>
          <h1 className="text-xl font-bold text-base-content">設定</h1>
          <p className="mt-0.5 text-xs text-base-content/55">變更立即生效，不需「儲存」</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* 外觀 */}
        <section className="rounded-xl border border-base-content/10 p-5 bg-base-100/50">
          <Cap>外觀</Cap>
          <div className="mt-4">
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

        {/* 搜尋預設 */}
        <section className="rounded-xl border border-base-content/10 p-5 bg-base-100/50">
          <Cap>搜尋預設</Cap>
          <div className="mt-4 space-y-4">
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


        {/* 帳號 */}
        <section className="rounded-xl border border-base-content/10 p-5 bg-base-100/50">
          <Cap>帳號</Cap>
          <div className="mt-4">
            {user ? (
              <SettingRow label="目前帳號">
                <div className="flex items-center gap-4">
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
          <section className="rounded-xl border border-base-content/10 p-5 bg-base-100/50">
            <Cap>資料</Cap>
            <div className="mt-4">
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
        )}

        {/* 關於 */}
        <section className="p-5">
          <Cap>關於</Cap>
          <div className="mt-3 space-y-1 text-xs text-base-content/50">
            <p>版本 0.0.1</p>
            <p>咖啡口袋 · Coffee Pocket</p>
          </div>
        </section>
      </div>

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
    </DesktopPageLayout>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm font-medium text-base-content/85">{label}</span>
      {children}
    </div>
  );
}
