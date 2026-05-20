import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon, Coffee02Icon } from "@hugeicons/core-free-icons";
import { ThemeToggle } from "./ThemeToggle";

interface TopbarProps {
  variant?: "mobile" | "desktop";
}

/** 全站 topbar — 基於 daisyUI navbar。桌面不再含搜尋,搜尋移到左欄。 */
export function Topbar({ variant = "desktop" }: TopbarProps) {
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
          <button type="button" className="btn btn-ghost btn-sm btn-square" aria-label="選單">
            <HugeiconsIcon icon={Menu01Icon} size={20} strokeWidth={1.5} />
          </button>
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
        <button type="button" className="btn btn-ghost btn-sm">
          登入
        </button>
      </div>
    </header>
  );
}
