import { Link } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Menu01Icon,
  Search01Icon,
  Coffee02Icon,
  Moon02Icon,
} from "@hugeicons/core-free-icons";
import { ThemeToggle } from "./ThemeToggle";

interface TopbarProps {
  variant?: "mobile" | "desktop";
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  onSubmit?: () => void;
  searchPlaceholder?: string;
}

/** 全站 topbar — 基於 daisyUI navbar。 */
export function Topbar({
  variant = "desktop",
  searchValue,
  onSearchChange,
  onSubmit,
  searchPlaceholder = "找咖啡廳或情境⋯",
}: TopbarProps) {
  if (variant === "mobile") {
    return (
      <header className="navbar min-h-12 border-b border-base-content/15 bg-base-100 px-4">
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

  // desktop
  return (
    <header className="navbar min-h-14 border-b border-base-content/20 bg-base-100 px-6 gap-4">
      <div className="navbar-start gap-3 flex-none">
        <Link to="/" className="flex items-center gap-2">
          <HugeiconsIcon icon={Coffee02Icon} size={22} strokeWidth={1.5} />
          <span className="text-lg font-semibold tracking-tight">咖啡口袋</span>
          <span className="hidden lg:inline font-mono text-[10px] uppercase tracking-widest text-base-content/55 ml-1">
            Tainan · 臺南
          </span>
        </Link>
      </div>
      <div className="navbar-center flex-1 max-w-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit?.();
          }}
          className="join w-full border border-base-content/25 bg-base-100"
        >
          <span className="join-item flex items-center pl-3 text-base-content/55">
            <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.5} />
          </span>
          <input
            type="text"
            className="input input-ghost join-item flex-1 focus:outline-none focus:bg-transparent"
            placeholder={searchPlaceholder}
            value={searchValue ?? ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
          />
          <button type="submit" className="btn btn-neutral join-item">
            搜尋
          </button>
        </form>
      </div>
      <div className="navbar-end gap-2 flex-none">
        <ThemeToggle />
        <button type="button" className="btn btn-ghost btn-sm">
          登入
        </button>
      </div>
    </header>
  );
}

// 為了讓編譯不警告 Moon02Icon 未使用 — 留給後續 dark toggle
export const _unused = { Moon02Icon };
