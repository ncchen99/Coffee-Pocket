import { useState } from "react";
import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon, Mail01Icon, Logout01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { Cap, ConfirmModal } from "@/components/primitives";
import { DesktopPageLayout } from "@/components/layout/DesktopPageLayout";
import { useAuth } from "@/hooks/useAuth";
import { useUserStats, useContributions } from "@/hooks/useProfile";

function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d} 天前`;
  const w = Math.floor(d / 7);
  if (w < 8) return `${w} 週前`;
  return new Date(iso).toLocaleDateString();
}

function DesktopContributionsSkeleton() {
  return (
    <ul className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex flex-col gap-2">
          <div className="h-5 w-48 bg-base-200 animate-pulse rounded" />
          <div className="h-3 w-24 bg-base-200 animate-pulse rounded" />
        </li>
      ))}
    </ul>
  );
}

/**
 * 桌面版個人頁 — 使用 DesktopPageLayout 置中呈現。
 */
export default function DesktopProfilePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const { data: stats } = useUserStats(user?.id ?? null);
  const { data: contributions = [], isLoading: contributionsLoading } = useContributions(
    user?.id ?? null,
    10,
  );

  if (authLoading) {
    return (
      <DesktopPageLayout>
        <section className="flex items-center gap-4 pb-6">
          <div className="h-16 w-16 bg-base-200 animate-pulse rounded-full" />
          <div className="space-y-2">
            <div className="h-6 w-32 bg-base-200 animate-pulse rounded" />
            <div className="h-4 w-40 bg-base-200 animate-pulse rounded" />
          </div>
        </section>
        <section className="rounded-xl border border-base-content/10 p-5">
          <div className="h-4 w-16 bg-base-200 animate-pulse rounded mb-4" />
          <div className="grid grid-cols-3 divide-x divide-base-content/10 text-center">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="h-8 w-10 bg-base-200 animate-pulse rounded" />
                <div className="h-3 w-8 bg-base-200 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </section>
        <section className="mt-6 rounded-xl border border-base-content/10 p-5">
          <div className="h-4 w-16 bg-base-200 animate-pulse rounded mb-4" />
          <DesktopContributionsSkeleton />
        </section>
      </DesktopPageLayout>
    );
  }

  if (!user) {
    return (
      <DesktopPageLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-semibold">登入來管理你的口袋</p>
          <p className="mt-1 text-sm text-base-content/55">收藏、貢獻紀錄都在這裡</p>
          <Link to="/login" className="btn btn-neutral mt-6">登入</Link>
        </div>
      </DesktopPageLayout>
    );
  }

  const displayName = user.user_metadata?.full_name ?? user.email ?? "使用者";
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  const visibleContributions = contributions.slice(0, 5);
  const totalContributions = (stats?.edits_count ?? 0) + (stats?.votes_count ?? 0);

  return (
    <DesktopPageLayout>
      {/* User info */}
      <section className="flex items-center gap-4 pb-6">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-16 w-16 rounded-full" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-base-200 text-xl font-bold">
            {displayName[0]}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold">{displayName}</h1>
          <p className="text-sm text-base-content/55">加入 2026 · 臺南</p>
        </div>
      </section>

      {/* Stats */}
      <section className="rounded-xl border border-base-content/10 p-5">
        <Cap>我的數字</Cap>
        <div className="mt-4 grid grid-cols-3 divide-x divide-base-content/10 text-center items-center">
          <Link
            to="/pocket"
            className="hover:bg-base-200/50 transition-colors py-2 rounded block"
          >
            <p className="text-2xl font-bold">{stats?.pocket_items_count ?? 0}</p>
            <p className="text-xs text-base-content/55">收藏</p>
          </Link>
          <Link
            to="/pocket"
            className="hover:bg-base-200/50 transition-colors py-2 rounded block"
          >
            <p className="text-2xl font-bold">{stats?.pocket_count ?? 0}</p>
            <p className="text-xs text-base-content/55">口袋</p>
          </Link>
          <div>
            <p className="text-2xl font-bold">
              {(stats?.edits_count ?? 0) + (stats?.votes_count ?? 0)}
            </p>
            <p className="text-xs text-base-content/55">貢獻</p>
          </div>
        </div>
      </section>

      {/* Contributions */}
      <section className="mt-6 rounded-xl border border-base-content/10 p-5">
        <Cap>我的貢獻</Cap>
        {contributionsLoading ? (
          <div className="mt-3">
            <DesktopContributionsSkeleton />
          </div>
        ) : contributions.length === 0 ? (
          <p className="mt-3 text-sm text-base-content/55">還沒有貢獻紀錄</p>
        ) : (
          <ul className="mt-3 divide-y divide-base-content/10">
            {visibleContributions.map((c) => (
              <li key={c.id} className="py-3">
                <p className="text-sm">
                  {c.detail}
                  {c.cafe_name && ` · ${c.cafe_name}`}
                </p>
                <p className="mt-0.5 text-[11px] text-base-content/50">
                  {relativeTime(c.created_at)}
                  {c.status && ` · ${c.status}`}
                </p>
              </li>
            ))}
            {totalContributions > 5 && (
              <li className="py-3 text-xs text-base-content/45">
                還有 {totalContributions - 5} 筆貢獻
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Menu */}
      <section className="mt-6 rounded-xl border border-base-content/10 overflow-hidden">
        <ul className="divide-y divide-base-content/10">
          <li>
            <Link to="/add-cafe" className="flex items-center gap-3 px-5 py-3 hover:bg-base-200/60 transition-colors">
              <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={1.5} className="text-base-content/65" />
              <span className="text-sm">新增咖啡廳</span>
            </Link>
          </li>
          <li>
            <Link to="/settings" className="flex items-center gap-3 px-5 py-3 hover:bg-base-200/60 transition-colors">
              <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.5} className="text-base-content/65" />
              <span className="text-sm">設定</span>
            </Link>
          </li>
          <li>
            <a href="mailto:ncchen99@gmail.com" className="flex items-center gap-3 px-5 py-3 hover:bg-base-200/60 transition-colors">
              <HugeiconsIcon icon={Mail01Icon} size={16} strokeWidth={1.5} className="text-base-content/65" />
              <span className="text-sm">反饋</span>
            </a>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setIsLogoutModalOpen(true)}
              className="flex w-full items-center gap-3 px-5 py-3 hover:bg-base-200/60 transition-colors"
            >
              <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={1.5} className="text-base-content/65" />
              <span className="text-sm">登出</span>
            </button>
          </li>
        </ul>
      </section>

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={signOut}
        title="確認登出"
        message="您確定要登出您的咖啡口袋帳號嗎？登出後將無法同步您的收藏與口袋名單。"
        confirmText="確認登出"
      />
    </DesktopPageLayout>
  );
}
