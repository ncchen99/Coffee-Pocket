import { useEffect, useState } from "react";

/** 判斷是否為桌面尺寸 — 對應 Tailwind `lg` (1024px)。 */
export function useIsDesktop(): boolean {
  const [is, setIs] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false,
  );
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIs(e.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, []);
  return is;
}
