import type { ReactNode } from "react";
import clsx from "@/lib/clsx";

interface TagBadgeProps {
  children: ReactNode;
  variant?: "outline" | "neutral" | "ghost" | "accent";
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** 純展示用標籤,基於 daisyUI `badge`。 */
export function TagBadge({
  children,
  variant = "outline",
  size = "sm",
  className,
}: TagBadgeProps) {
  const sizeCls = { sm: "badge-sm", md: "", lg: "badge-lg" }[size];
  const variantCls = {
    outline: "badge-outline",
    neutral: "badge-neutral",
    ghost: "badge-ghost",
    accent: "badge-accent badge-outline",
  }[variant];
  return (
    <span className={clsx("badge", sizeCls, variantCls, className)}>
      {children}
    </span>
  );
}
