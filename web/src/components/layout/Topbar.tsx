import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Coffee02Icon, UserIcon, BookmarkAdd01Icon, Settings01Icon, Logout01Icon, Loading03Icon, CheckmarkCircle02Icon, AlertCircleIcon } from "@hugeicons/core-free-icons";
import { ThemeToggle } from "./ThemeToggle";
import { ConfirmModal } from "@/components/primitives";
import { useAuth } from "@/hooks/useAuth";
import { globalProgress, type ProgressState } from "@/lib/api";

interface TopbarProps {
  variant?: "mobile" | "desktop";
}

/** 全站 topbar — 基於 daisyUI navbar。桌面不再含搜尋,搜尋移到左欄。 */
export function Topbar({ variant = "desktop" }: TopbarProps) {
  const { user, signInWithGoogle, signOut } = useAuth();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // 全域新增咖啡廳進度
  const [progress, setProgress] = useState<ProgressState>({ progress: null, success: null, error: null });

  useEffect(() => {
    if (variant === "desktop") {
      globalProgress.subscribe((state) => setProgress(state));
      return () => globalProgress.unsubscribe();
    }
  }, [variant]);

  if (variant === "mobile") {
    return (
      <header className="navbar min-h-12 border-b border-base-content/10 bg-base-100 px-4">
        <div className="navbar-start">
          <Link to="/" className="flex items-center gap-2">
            <HugeiconsIcon icon={Coffee02Icon} size={20} strokeWidth={1.5} />
            <span className="text-base font-semibold tracking-tight">咖啡口袋</span>
          </Link>
        </div>
        <div className="navbar-end gap-1">
          <ThemeToggle />
        </div>
      </header>
    );
  }

  // desktop — logo 左,主題 + 登入右,中間留白
  const hasProgress = !!(progress.progress || progress.success || progress.error);
  const isSuccess = !!progress.success;
  const isError = !!progress.error;
  const text = progress.progress || progress.success || progress.error || "";

  return (
    <header className="navbar min-h-14 border-b border-base-content/10 bg-base-100 px-6">
      <div className="navbar-start gap-4">
        <Link to="/" className="flex items-center gap-2">
          <HugeiconsIcon icon={Coffee02Icon} size={22} strokeWidth={1.5} />
          <span className="text-lg font-semibold tracking-tight">咖啡口袋</span>
          <span className="hidden lg:inline font-mono text-[10px] uppercase tracking-widest text-base-content/55 ml-1 relative top-[1.5px]">
            Tainan · 臺南
          </span>
        </Link>

        {/* 桌面版背景進度提示 */}
        {hasProgress && (
          <div className={`flex items-center gap-2 text-xs border px-3.5 py-1.5 rounded-full shadow-sm animate-pulse max-w-[280px] lg:max-w-[400px] truncate ${
            isSuccess ? "bg-success/15 border-success/30 text-success" : isError ? "bg-error/15 border-error/30 text-error" : "bg-base-200 border-base-content/10 text-base-content/85"
          }`}>
            {!isSuccess && !isError ? (
              <HugeiconsIcon icon={Loading03Icon} size={13} className="animate-spin text-primary shrink-0" />
            ) : isSuccess ? (
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} className="text-success shrink-0" />
            ) : (
              <HugeiconsIcon icon={AlertCircleIcon} size={13} className="text-error shrink-0" />
            )}
            <span className="font-medium truncate">{text}</span>
          </div>
        )}
      </div>
      <div className="navbar-end gap-2">
        <ThemeToggle />
        {user ? (
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-sm gap-1.5">
              {(user.user_metadata?.avatar_url as string | undefined) ? (
                <img
                  src={user.user_metadata.avatar_url as string}
                  alt=""
                  className="h-5 w-5 rounded-full"
                />
              ) : (
                <HugeiconsIcon icon={UserIcon} size={16} strokeWidth={1.5} />
              )}
              {user.user_metadata?.full_name ?? "我的"}
            </div>
            <ul
              tabIndex={0}
              className="dropdown-content menu z-50 mt-1 w-48 rounded-xl border border-base-content/10 bg-base-100 p-2 shadow-lg"
            >
              <li>
                <Link to="/profile" className="gap-2">
                  <HugeiconsIcon icon={UserIcon} size={15} strokeWidth={1.5} />
                  個人頁面
                </Link>
              </li>
              <li>
                <Link to="/pocket" className="gap-2">
                  <HugeiconsIcon icon={BookmarkAdd01Icon} size={15} strokeWidth={1.5} />
                  口袋名單
                </Link>
              </li>
              <li>
                <Link to="/settings" className="gap-2">
                  <HugeiconsIcon icon={Settings01Icon} size={15} strokeWidth={1.5} />
                  設定
                </Link>
              </li>
              <div className="divider my-1" />
              <li>
                <button type="button" onClick={() => setIsLogoutModalOpen(true)} className="gap-2">
                  <HugeiconsIcon icon={Logout01Icon} size={15} strokeWidth={1.5} />
                  登出
                </button>
              </li>
            </ul>
          </div>
        ) : (
          <button
            type="button"
            onClick={signInWithGoogle}
            className="btn btn-ghost btn-sm"
          >
            登入
          </button>
        )}
      </div>

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={signOut}
        title="確認登出"
        message="您確定要登出您的咖啡口袋帳號嗎？登出後將無法同步您的收藏與口袋名單。"
        confirmText="確認登出"
      />
    </header>
  );
}
