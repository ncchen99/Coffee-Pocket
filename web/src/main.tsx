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
  try {
    const saved = localStorage.getItem("cp.theme");
    const theme =
      saved ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "coffee-roast"
        : "coffee-paper");
    document.documentElement.setAttribute("data-theme", theme);
  } catch {
    document.documentElement.setAttribute("data-theme", "coffee-paper");
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
