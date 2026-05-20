import { Link, useLocation } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Home01Icon, BookmarkAdd01Icon, UserIcon } from "@hugeicons/core-free-icons";
import clsx from "@/lib/clsx";

const TABS = [
  { to: "/", icon: Home01Icon, label: "首頁" },
  { to: "/pocket", icon: BookmarkAdd01Icon, label: "口袋" },
  { to: "/profile", icon: UserIcon, label: "我" },
] as const;

/** 手機底部分頁列 — 固定在螢幕最下方。 */
export function MobileTabBar() {
  const { pathname } = useLocation();

  return (
    <nav className="sticky bottom-0 z-30 flex border-t border-base-content/10 bg-base-100">
      {TABS.map((tab) => {
        const active = pathname === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={clsx(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
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
