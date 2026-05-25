import { useState } from "react";
import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon, Mail01Icon, Logout01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { Cap, ConfirmModal } from "@/components/primitives";
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

/** 個人 tab 的 sheet 內容 — 從原 ProfilePage 抽出。 */
export function ProfileSheetContent() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const { data: stats } = useUserStats(user?.id ?? null);
  const { data: contributions = [], isLoading: contributionsLoading } = useContributions(
    user?.id ?? null,
    10,
  );

  if (authLoading) {
    return (
      <div className="px-5 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-base-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-base-200" />
            <div className="h-3 w-32 animate-pulse rounded bg-base-200" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <p className="text-lg font-semibold">登入來管理你的口袋</p>
        <p className="mt-1 text-sm text-base-content/55">收藏、貢獻紀錄都在這裡</p>
        <Link to="/login" className="btn btn-neutral mt-6">
          登入
        </Link>
      </div>
    );
  }

  const displayName = user.user_metadata?.full_name ?? user.email ?? "使用者";
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <section className="border-b border-base-content/10 px-5 py-4">
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

      <section className="border-b border-base-content/10 px-5 py-4">
        <Cap>我的數字</Cap>
        <div className="mt-3 grid grid-cols-3 divide-x divide-base-content/10 text-center">
          <div>
            <p className="text-xl font-bold">{stats?.pocket_items_count ?? 0}</p>
            <p className="text-xs text-base-content/55">收藏</p>
          </div>
          <div>
            <p className="text-xl font-bold">{stats?.pocket_count ?? 0}</p>
            <p className="text-xs text-base-content/55">口袋</p>
          </div>
          <div>
            <p className="text-xl font-bold">
              {(stats?.edits_count ?? 0) + (stats?.votes_count ?? 0)}
            </p>
            <p className="text-xs text-base-content/55">貢獻</p>
          </div>
        </div>
      </section>

      <section className="border-b border-base-content/10 px-5 py-4">
        <Cap>我的貢獻</Cap>
        {contributionsLoading ? (
          <ul className="mt-3 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i}>
                <div className="h-4 w-32 animate-pulse rounded bg-base-200" />
                <div className="mt-1 h-3 w-20 animate-pulse rounded bg-base-200" />
              </li>
            ))}
          </ul>
        ) : contributions.length === 0 ? (
          <p className="mt-3 text-sm text-base-content/55">還沒有貢獻紀錄</p>
        ) : (
          <ul className="mt-3 divide-y divide-base-content/10">
            {contributions.map((c) => (
              <li key={c.id} className="py-2">
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
          </ul>
        )}
      </section>

      <ul className="divide-y divide-base-content/10 border-b border-base-content/10">
        <li>
          <Link
            to="/add-cafe"
            className="flex items-center gap-3 px-5 py-3 active:bg-base-200/60"
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              size={16}
              strokeWidth={1.5}
              className="text-base-content/65"
            />
            <span className="text-sm">新增咖啡廳</span>
          </Link>
        </li>
        <li>
          <Link
            to="/settings"
            className="flex items-center gap-3 px-5 py-3 active:bg-base-200/60"
          >
            <HugeiconsIcon
              icon={Settings01Icon}
              size={16}
              strokeWidth={1.5}
              className="text-base-content/65"
            />
            <span className="text-sm">設定</span>
          </Link>
        </li>
        <li>
          <a
            href="mailto:feedback@coffeepocket.tw"
            className="flex items-center gap-3 px-5 py-3 active:bg-base-200/60"
          >
            <HugeiconsIcon
              icon={Mail01Icon}
              size={16}
              strokeWidth={1.5}
              className="text-base-content/65"
            />
            <span className="text-sm">反饋</span>
          </a>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setIsLogoutModalOpen(true)}
            className="flex w-full items-center gap-3 px-5 py-3 active:bg-base-200/60"
          >
            <HugeiconsIcon
              icon={Logout01Icon}
              size={16}
              strokeWidth={1.5}
              className="text-base-content/65"
            />
            <span className="text-sm">登出</span>
          </button>
        </li>
      </ul>

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={signOut}
        title="確認登出"
        message="您確定要登出您的咖啡口袋帳號嗎？登出後將無法同步您的收藏與口袋名單。"
        confirmText="確認登出"
      />
    </div>
  );
}
