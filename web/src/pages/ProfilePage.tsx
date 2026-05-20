import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon, Mail01Icon, Logout01Icon } from "@hugeicons/core-free-icons";
import { Cap } from "@/components/primitives";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { useAuth } from "@/hooks/useAuth";

const MOCK_CONTRIBUTIONS = [
  { id: "1", text: "修正「窩 café」插座資訊", time: "2 天前", status: "已被採用" },
  { id: "2", text: "新增「kinks coffee」", time: "1 週前", status: "待審核" },
  { id: "3", text: "為「老房子」投票安靜", time: "2 週前", status: "" },
];

/**
 * 個人頁 — 顯示使用者口袋數量、貢獻紀錄、設定入口。
 */
export default function ProfilePage() {
  const { user, signOut } = useAuth();

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-base-100">
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-lg font-semibold">登入來管理你的口袋</p>
          <p className="mt-1 text-sm text-base-content/55">
            收藏、貢獻紀錄都在這裡
          </p>
          <Link to="/login" className="btn btn-neutral mt-6">
            登入
          </Link>
        </div>
        <MobileTabBar />
      </div>
    );
  }

  const displayName = user.user_metadata?.full_name ?? user.email ?? "使用者";
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <div className="flex min-h-screen flex-col bg-base-100">
      {/* Header */}
      <section className="border-b border-base-content/10 px-5 py-5">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center bg-base-200 text-sm font-bold">
              {displayName[0]}
            </div>
          )}
          <div>
            <p className="font-semibold">{displayName}</p>
            <p className="text-xs text-base-content/55">加入 2026 · 臺南</p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-base-content/10 px-5 py-4">
        <Cap>我的數字</Cap>
        <div className="mt-3 grid grid-cols-3 divide-x divide-base-content/10 text-center">
          <div>
            <p className="text-xl font-bold">7</p>
            <p className="text-xs text-base-content/55">收藏</p>
          </div>
          <div>
            <p className="text-xl font-bold">3</p>
            <p className="text-xs text-base-content/55">口袋</p>
          </div>
          <div>
            <p className="text-xl font-bold">21</p>
            <p className="text-xs text-base-content/55">貢獻</p>
          </div>
        </div>
      </section>

      {/* Contributions */}
      <section className="flex-1 border-b border-base-content/10 px-5 py-4">
        <Cap>我的貢獻</Cap>
        <ul className="mt-3 divide-y divide-base-content/10">
          {MOCK_CONTRIBUTIONS.map((c) => (
            <li key={c.id} className="py-2">
              <p className="text-sm">{c.text}</p>
              <p className="mt-0.5 text-[11px] text-base-content/50">
                {c.time}
                {c.status && ` · ${c.status}`}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Menu */}
      <ul className="divide-y divide-base-content/10 border-b border-base-content/10">
        <li>
          <Link to="/settings" className="flex items-center gap-3 px-5 py-3 active:bg-base-200/60">
            <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.5} className="text-base-content/65" />
            <span className="text-sm">設定</span>
          </Link>
        </li>
        <li>
          <a href="mailto:feedback@coffeepocket.tw" className="flex items-center gap-3 px-5 py-3 active:bg-base-200/60">
            <HugeiconsIcon icon={Mail01Icon} size={16} strokeWidth={1.5} className="text-base-content/65" />
            <span className="text-sm">反饋</span>
          </a>
        </li>
        <li>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-3 px-5 py-3 active:bg-base-200/60"
          >
            <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={1.5} className="text-base-content/65" />
            <span className="text-sm">登出</span>
          </button>
        </li>
      </ul>

      <MobileTabBar />
    </div>
  );
}
