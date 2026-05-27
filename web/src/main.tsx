import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserLocationProvider } from "./context/UserLocationContext";
import { registerServiceWorker } from "./registerServiceWorker";
import App from "./App";
import "mapbox-gl/dist/mapbox-gl.css";
import "./styles/index.css";

// 在 React mount 前先套用主題,避免「沒有 Topbar 的頁面(口袋 / 個人)
// 重新整理後抓不到 data-theme,被 daisyUI 切回預設色」的閃爍與走樣。
(() => {
  const updateThemeColor = (themeName: string | null) => {
    // coffee-roast (dark) 搭配 #1B1714 (base-100)，coffee-paper (light) 搭配 #FFF8EE (base-100)
    const color = themeName === "coffee-roast" ? "#1B1714" : "#FFF8EE";
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", color);
  };

  try {
    const saved = localStorage.getItem("cp.theme");
    const theme =
      saved ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "coffee-roast"
        : "coffee-paper");
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeColor(theme);
  } catch {
    document.documentElement.setAttribute("data-theme", "coffee-paper");
    updateThemeColor("coffee-paper");
  }

  // 監聽 data-theme 屬性變化，動態更新 PWA 主題顏色
  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "data-theme") {
          const newTheme = document.documentElement.getAttribute("data-theme");
          updateThemeColor(newTheme);
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }
})();

registerServiceWorker();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <UserLocationProvider>
          <App />
        </UserLocationProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
