import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Moon02Icon, Sun02Icon } from "@hugeicons/core-free-icons";

const KEY = "cp.theme";
type Theme = "coffee-paper" | "coffee-roast";

function readTheme(): Theme {
  if (typeof window === "undefined") return "coffee-paper";
  const saved = localStorage.getItem(KEY) as Theme | null;
  if (saved) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "coffee-roast"
    : "coffee-paper";
}

/** Light / dark 切換 — 用 daisyUI `swap` + `btn-ghost`,寫入 data-theme。 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("coffee-paper");

  useEffect(() => {
    const t = readTheme();
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "coffee-paper" ? "coffee-roast" : "coffee-paper";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(KEY, next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="切換主題"
      className="btn btn-ghost btn-sm btn-square"
    >
      <HugeiconsIcon
        icon={theme === "coffee-paper" ? Moon02Icon : Sun02Icon}
        size={18}
        strokeWidth={1.5}
      />
    </button>
  );
}
