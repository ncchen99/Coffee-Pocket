import { Link, useLocation } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Home01Icon, BookmarkAdd01Icon, UserIcon } from "@hugeicons/core-free-icons";
import clsx from "@/lib/clsx";

const TABS = [
  { to: "/", icon: Home01Icon, label: "首頁" },
  { to: "/pocket", icon: BookmarkAdd01Icon, label: "口袋" },
  { to: "/profile", icon: UserIcon, label: "我" },
] as const;

/**
 * 手機底部分頁列。
 * 因為 sheet (vaul drawer) 用 z-20、cafe detail 用更高 z,這個 tab bar 必須 z 高過
 * 它們才會永遠浮在最上層 — 切換 tab 是全應用的入口,不能被 sheet 蓋住。
 * 改用半透明 bg + backdrop-blur,讓背景地圖在 tab bar 後方仍可隱約看見。
 */
export function MobileTabBar() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-base-content/10 bg-base-100/90 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => {
        // /cafe/:slug 與其他子路由不主動點亮任何 tab — 點 ← 後 history 會回到正確 tab
        const active = pathname === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={clsx(
              "flex flex-1 flex-col items-center gap-0.5 pt-1 pb-0.5 text-[10px]",
              active ? "text-base-content" : "text-base-content/45",
            )}
          >
            <HugeiconsIcon icon={tab.icon} size={20} strokeWidth={active ? 2 : 1.5} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
