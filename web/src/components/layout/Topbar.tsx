import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Coffee02Icon, UserIcon, BookmarkAdd01Icon, Settings01Icon, Logout01Icon } from "@hugeicons/core-free-icons";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/hooks/useAuth";

interface TopbarProps {
  variant?: "mobile" | "desktop";
}

/** 全站 topbar — 基於 daisyUI navbar。桌面不再含搜尋,搜尋移到左欄。 */
export function Topbar({ variant = "desktop" }: TopbarProps) {
  const { user, signInWithGoogle, signOut } = useAuth();

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
  return (
    <header className="navbar min-h-14 border-b border-base-content/10 bg-base-100 px-6">
      <div className="navbar-start gap-3">
        <Link to="/" className="flex items-center gap-2">
          <HugeiconsIcon icon={Coffee02Icon} size={22} strokeWidth={1.5} />
          <span className="text-lg font-semibold tracking-tight">咖啡口袋</span>
          <span className="hidden lg:inline font-mono text-[10px] uppercase tracking-widest text-base-content/55 ml-1">
            Tainan · 臺南
          </span>
        </Link>
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
                <button type="button" onClick={signOut} className="gap-2">
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
    </header>
  );
}
