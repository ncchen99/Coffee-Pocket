import type { ReactNode } from "react";
import clsx from "@/lib/clsx";

interface CapProps {
  children: ReactNode;
  className?: string;
}

/** 區段小標 — 等寬字、大寫、字距加大、淡色。視覺低調,給 power user 認路。 */
export function Cap({ children, className }: CapProps) {
  return (
    <div
      className={clsx(
        "font-mono text-[10px] uppercase tracking-[0.18em] text-base-content/55",
        className,
      )}
    >
      {children}
    </div>
  );
}
