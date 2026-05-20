import type { ReactNode } from "react";
import clsx from "@/lib/clsx";

interface TagChipProps {
  children: ReactNode;
  selected?: boolean;
  accent?: boolean;
  size?: "xs" | "sm";
  onClick?: () => void;
  className?: string;
}

/**
 * 標籤膠囊 — 建立在 daisyUI 的 `btn` 之上(可選 / 點擊)。
 * 沒有點擊行為的純展示標籤請改用 daisyUI `badge` (見 <TagBadge>)。
 *
 * - 預設:btn btn-outline btn-xs   (未選)
 * - selected:btn btn-neutral btn-xs (選中,深底反白)
 * - accent:btn btn-accent btn-outline btn-xs (推薦項)
 */
export function TagChip({
  children,
  selected,
  accent,
  size = "xs",
  onClick,
  className,
}: TagChipProps) {
  const sizeCls = size === "sm" ? "btn-sm" : "btn-xs";
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "btn",
        sizeCls,
        "font-normal normal-case",
        selected
          ? "border-primary bg-primary text-primary-content hover:bg-primary hover:border-primary hover:text-primary-content"
          : accent
            ? "btn-outline btn-accent"
            : "btn-outline",
        className,
      )}
    >
      {children}
    </button>
  );
}
