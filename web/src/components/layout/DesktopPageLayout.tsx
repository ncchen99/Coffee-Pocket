import type { ReactNode } from "react";
import { Topbar } from "./Topbar";

interface DesktopPageLayoutProps {
  children: ReactNode;
}

/**
 * 桌面版內頁佈局 — Topbar + 置中內容區。
 * 用於 Profile、Pocket、Settings 等非地圖頁面。
 */
export function DesktopPageLayout({ children }: DesktopPageLayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-base-100">
      <Topbar variant="desktop" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-8">{children}</div>
      </div>
    </div>
  );
}
