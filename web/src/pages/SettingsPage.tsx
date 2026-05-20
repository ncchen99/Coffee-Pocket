import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { Cap } from "@/components/primitives";
import { useAuth } from "@/hooks/useAuth";

/**
 * 設定頁 — 主題、搜尋預設、帳號管理。
 * 變更立即生效,不需「儲存」。
 */
export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-base-100">
      <header className="navbar sticky top-0 z-30 min-h-12 border-b border-base-content/10 bg-base-100/95 px-2 backdrop-blur">
        <div className="navbar-start">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn btn-ghost btn-sm btn-square"
            aria-label="返回"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="navbar-center">
          <h1 className="text-sm font-semibold">設定</h1>
        </div>
        <div className="navbar-end" />
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* 外觀 */}
        <section className="px-5 pt-5">
          <Cap>外觀</Cap>
          <div className="mt-3 space-y-3">
            <SettingRow label="主題">
              <select
                className="select select-bordered select-sm w-36"
                defaultValue="system"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "light") document.documentElement.setAttribute("data-theme", "coffee-paper");
                  else if (val === "dark") document.documentElement.setAttribute("data-theme", "coffee-roast");
                  else {
                    const prefer = window.matchMedia("(prefers-color-scheme: dark)").matches ? "coffee-roast" : "coffee-paper";
                    document.documentElement.setAttribute("data-theme", prefer);
                  }
                }}
              >
                <option value="system">系統</option>
                <option value="light">淺色</option>
                <option value="dark">深色</option>
              </select>
            </SettingRow>
          </div>
        </section>

        <div className="divider mx-5" />

        {/* 搜尋預設 */}
        <section className="px-5">
          <Cap>搜尋預設</Cap>
          <div className="mt-3 space-y-3">
            <SettingRow label="預設距離">
              <select className="select select-bordered select-sm w-28" defaultValue="3">
                <option value="1">1 km</option>
                <option value="3">3 km</option>
                <option value="5">5 km</option>
                <option value="10">10 km</option>
              </select>
            </SettingRow>
            <SettingRow label="預設顯示">
              <select className="select select-bordered select-sm w-28" defaultValue="map">
                <option value="map">地圖</option>
                <option value="list">列表</option>
              </select>
            </SettingRow>
          </div>
        </section>

        <div className="divider mx-5" />

        {/* 帳號 */}
        <section className="px-5">
          <Cap>帳號</Cap>
          <div className="mt-3 space-y-2">
            {user ? (
              <>
                <p className="text-sm text-base-content/70">{user.email}</p>
                <button type="button" onClick={signOut} className="btn btn-ghost btn-sm px-0">
                  登出
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="btn btn-neutral btn-sm"
              >
                登入
              </button>
            )}
          </div>
        </section>

        <div className="divider mx-5" />

        {/* 關於 */}
        <section className="px-5 pb-10">
          <Cap>關於</Cap>
          <div className="mt-3 space-y-1 text-sm text-base-content/55">
            <p>版本 0.0.1</p>
            <p>咖啡口袋 · Coffee Pocket</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}
