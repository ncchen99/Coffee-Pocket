import type { ReactNode } from "react";
import clsx from "@/lib/clsx";

interface TagChipProps {
  children: ReactNode;
  selected?: boolean;
  /** 保留以維持既有呼叫端介面相容,目前視覺與未選相同。 */
  accent?: boolean;
  size?: "xs" | "sm";
  onClick?: () => void;
  className?: string;
  noShadow?: boolean;
  hasShadow?: boolean;
}

/**
 * 標籤膠囊 — 建立在 daisyUI 的 `btn` 之上(可選 / 點擊)。
 * 沒有點擊行為的純展示標籤請改用 daisyUI `badge` (見 <TagBadge>)。
 *
 * - 預設:bg-base-200 (跟著主題,實心淺/深底)
 * - selected:bg-neutral (深底反白,加陰影)
 */
export function TagChip({
  children,
  selected,
  accent: _accent,
  size = "xs",
  onClick,
  className,
  noShadow = false,
  hasShadow = false,
}: TagChipProps) {
  const sizeCls = size === "sm" ? "btn-sm" : "btn-xs";

  let shadowCls = "";
  if (!noShadow) {
    if (selected || hasShadow) {
      shadowCls = "shadow-md";
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "btn",
        sizeCls,
        "font-normal normal-case transition-shadow duration-200",
        selected
          ? `border-neutral-content/70 bg-neutral text-neutral-content hover:bg-neutral hover:border-neutral-content/70 hover:text-neutral-content ${shadowCls}`
          : `border-base-300 bg-base-200 text-base-content hover:bg-base-300 hover:border-base-300 hover:text-base-content ${shadowCls}`,
        className,
      )}
    >
      {children}
    </button>
  );
}
