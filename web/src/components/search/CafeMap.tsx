import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Navigation03Icon, Add01Icon, Remove01Icon } from "@hugeicons/core-free-icons";
import { useUserLocation } from "@/context/UserLocationContext";
import {
  MAPBOX_TOKEN,
  hasMapboxToken,
  TAINAN_CENTER,
  DEFAULT_ZOOM,
} from "@/lib/mapbox";
import type { CafeCard } from "@/types/cafe";

if (hasMapboxToken) mapboxgl.accessToken = MAPBOX_TOKEN;

interface CafeMapProps {
  cafes: CafeCard[];
  activeId?: string | null;
  userLocation?: { lng: number; lat: number } | null;
  onMarkerClick?: (id: string) => void;
  /**
   * 視覺上會被其他面板遮蓋的邊距(px)。flyTo 會把這些邊距視為「不可見區域」,
   * 把選中咖啡廳定位在剩餘可見區域的中心。
   * - 桌面:詳細欄從左側推進,寬度由 React 控制,Mapbox 容器同步 shrink → 不需 padding。
   * - 手機:bottom sheet 蓋住下半部 → 傳入 sheet 的高度。
   */
  paddingBottom?: number;
  className?: string;
}

// Huge Icons · Coffee02 paths,轉成 SVG markup 直接塞進 marker DOM。
const COFFEE_SVG = `
<svg viewBox="0 0 24 24" width="18" height="18" fill="none"
     stroke="currentColor" stroke-width="1.6"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M18.25 10.5H19.64C21.49 10.5 22.04 10.77 22 12.08C21.92 14.27 20.94 16.8 17 17.5"/>
  <path d="M5.95 20.61C2.57 18.02 2.07 14.34 2 10.5C1.97 8.84 2.45 8.5 4.66 8.5H15.34C17.55 8.5 18.03 8.84 18 10.5C17.93 14.34 17.43 18.02 14.05 20.61C13.09 21.35 12.28 21.5 10.92 21.5H9.08C7.72 21.5 6.91 21.35 5.95 20.61Z"/>
  <path d="M11.31 2.5C10.76 2.84 10 4 10 5.5M7.54 4C7.54 4 7 4.5 7 5.5M14 4C13.73 4.17 13.5 5 13.5 5.5"/>
</svg>`;

type ThemeName = "coffee-paper" | "coffee-roast";

function readTheme(): ThemeName {
  if (typeof document === "undefined") return "coffee-paper";
  const t = document.documentElement.getAttribute("data-theme");
  return t === "coffee-roast" ? "coffee-roast" : "coffee-paper";
}

// Mapbox Standard 風格的 config — 深色用 Dusk,淺色用 Dawn,色調都用 Faded。
function configForTheme(theme: ThemeName) {
  return {
    lightPreset: theme === "coffee-roast" ? "dusk" : "dawn",
    theme: "default",
    showPointOfInterestLabels: false,
    showTransitLabels: false,
    // 隱藏路標 — Mapbox Standard 的 road labels 同時包含路名與省/縣道編號(shield),
    // 沒有公開 API 可以只關掉 shield;路名飽和度也無法獨立調整,
    // 所以採取「整體關閉」以避免編號像 marker 一樣誤導視覺焦點。
    showRoadLabels: false,
  } as const;
}

function applyStandardConfig(map: mapboxgl.Map, theme: ThemeName) {
  const cfg = configForTheme(theme);
  (Object.keys(cfg) as Array<keyof typeof cfg>).forEach((k) => {
    try {
      map.setConfigProperty("basemap", k, cfg[k] as never);
    } catch {
      // Standard style 未載入時忽略,style.load 會重試。
    }
  });
}

function buildMarkerElement(name: string): {
  root: HTMLButtonElement;
  circle: HTMLDivElement;
  label: HTMLSpanElement;
} {
  // root 是 Mapbox Marker 的 element。
  // ⚠️ root 上絕對不要設 position —— Mapbox 的 .mapboxgl-marker class 會設
  //    position: absolute; top: 0; left: 0; 然後 inline 寫 transform 推到正確位置。
  //    inline style 的優先序高於 class,只要在 root 上設 position: relative/anything,
  //    Mapbox 的 absolute 就被蓋掉,marker 會卡在 in-flow 位置,zoom 時看起來就是漂移。
  //    (參考 mapbox-gl-js #7701)
  // ⚠️ root 上也不要放 transform transition —— Mapbox 每幀重寫 transform,
  //    一旦補間就會「追位置」。視覺、scale 動畫全部丟到內層 .circle。
  const root = document.createElement("button");
  root.type = "button";
  root.setAttribute("aria-label", name);
  root.className = "cp-cafe-marker";
  root.style.cssText = `
    width: 32px; height: 32px; padding: 0;
    background: transparent;
    border: 0;
    cursor: pointer;
  `;

  const circle = document.createElement("div");
  circle.className = "cp-cafe-marker__circle";
  circle.innerHTML = COFFEE_SVG;
  circle.style.cssText = `
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
    border-radius: 9999px;
    background: oklch(var(--bc) / 1);
    color: oklch(var(--b1) / 1);
    box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    transform-origin: center;
    transition: transform 160ms ease, background-color 160ms ease, color 160ms ease;
    pointer-events: none;
  `;

  const label = document.createElement("span");
  label.textContent = name;
  label.className = "cp-cafe-marker__label";
  label.style.cssText = `
    position: absolute;
    top: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 8px;
    font-size: 13px;
    line-height: 1.3;
    font-weight: 600;
    white-space: nowrap;
    color: oklch(var(--b1) / 1);
    background: oklch(var(--bc) / 1);
    box-shadow: 0 1px 2px rgba(0,0,0,0.18);
    cursor: pointer;
    max-width: 11rem;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background-color 160ms ease, color 160ms ease;
  `;

  root.appendChild(circle);
  root.appendChild(label);
  return { root, circle, label };
}

interface MarkerHandle {
  marker: mapboxgl.Marker;
  circle: HTMLDivElement;
  label: HTMLSpanElement;
}

/** 共用的 Mapbox 容器,內含 marker 渲染與 active highlight。 */
export function CafeMap({
  cafes,
  activeId,
  userLocation,
  onMarkerClick,
  paddingBottom = 0,
  className,
}: CafeMapProps) {
  const { requestLocation, isLoading: isLocationLoading } = useUserLocation();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerHandle>>(new Map());
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const hasFlownToUserRef = useRef(false);

  const handleLocateClick = () => {
    if (userLocation) {
      mapRef.current?.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 14,
        duration: 800,
      });
    } else {
      requestLocation((coords) => {
        mapRef.current?.flyTo({
          center: [coords.lng, coords.lat],
          zoom: 14,
          duration: 800,
        });
      });
    }
  };

  // onMarkerClick 在父層通常是 inline arrow,每次 render 都是新 ref。
  // 透過 ref 取最新 handler,讓 markers effect 只依賴 cafes,
  // 避免每次 activeId 變更時把所有 marker destroy + recreate
  // (這會讓 active class 短暫遺失 → 「選中閃一下又變回去」的根因,
  //  也會打斷 flyTo / easeTo 的視覺收斂)。
  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  // init
  useEffect(() => {
    if (!container.current || mapRef.current || !hasMapboxToken) return;
    const initialTheme = readTheme();
    const map = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/standard",
      center: TAINAN_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: 14,
      maxZoom: 17,
      attributionControl: false,
      // v3 Standard style 接受 config 物件
      config: { basemap: configForTheme(initialTheme) } as never,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    // 確保 style 載入後設定一次(初始 config 在某些版本/快取狀態下會被忽略)
    map.on("style.load", () => applyStandardConfig(map, readTheme()));

    // 中間欄開合會讓 container 寬度連續變化 —— ResizeObserver 每幀通知一次,
    // map.resize() 重算 canvas + reproject,動畫過程不會出現黑邊或閃動。
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);

    // 監聽主題切換 —— ThemeToggle 寫入 <html data-theme=...>
    const observer = new MutationObserver(() => applyStandardConfig(map, readTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    mapRef.current = map;
    return () => {
      observer.disconnect();
      ro.disconnect();
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((h) => h.marker.remove());
    markersRef.current.clear();
    cafes.forEach((c) => {
      const { root, circle, label } = buildMarkerElement(c.name);
      // label 是 root button 的 child,點到 label 會自動冒泡到 button → 整顆 marker 都可點。
      // 注意:不切換成 null —— 圖釘一旦被選取就保持選取狀態(再點同一顆也維持選取),
      // 避免左側 sidebar 失去 active 對象、不知道要顯示什麼。
      root.addEventListener("click", (e) => {
        e.stopPropagation();
        onMarkerClickRef.current?.(c.id);
      });
      const marker = new mapboxgl.Marker({ element: root, anchor: "center" })
        .setLngLat([c.lng, c.lat])
        .addTo(map);
      markersRef.current.set(c.id, { marker, circle, label });
    });
  }, [cafes]);

  // user location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    if (userLocation) {
      const el = document.createElement("div");
      el.className = "cp-user-marker";
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
      userMarkerRef.current = marker;

      // Fly to user location only once when coordinates are first fetched
      if (!activeId && !hasFlownToUserRef.current) {
        hasFlownToUserRef.current = true;
        map.flyTo({
          center: [userLocation.lng, userLocation.lat],
          zoom: 14,
          duration: 800,
          padding: { top: 0, right: 0, bottom: paddingBottom, left: 0 },
        });
      }
    } else {
      hasFlownToUserRef.current = false;
    }
  }, [userLocation, activeId, paddingBottom]);

  // 持久化 padding —— 把 sheet 覆蓋的範圍視為「不可見區域」,
  // 不只用在 flyTo / easeTo,連手動 pan / resize 也會以此重算中心。
  // 沒有這段時,沒有 activeId 的情況下(剛載入)中心會落在 container 幾何中心,
  // 結果被 sheet 整個吞掉。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setPadding({ top: 0, right: 0, bottom: paddingBottom, left: 0 });
  }, [paddingBottom]);

  // highlight active —— 桌面 / 手機都顯示色彩切換
  // 用 class toggle 而非 inline style,讓 hover / active 的 CSS 規則保有正常的階層,
  // 也避免日後想新增動畫效果時需要逐個複寫 inline style。
  useEffect(() => {
    markersRef.current.forEach((h, id) => {
      const selected = id === activeId;
      h.circle.parentElement!.classList.toggle("cp-cafe-marker--active", selected);
      h.circle.parentElement!.style.zIndex = selected ? "2" : "1";
    });
    if (!activeId || !mapRef.current) return;
    const cafe = cafes.find((c) => c.id === activeId);
    if (!cafe) return;
    const map = mapRef.current;
    // 桌面詳細欄展開時容器寬度會在 300ms 內漸變;在轉場期間先發 flyTo 容易被 resize
    // 重投影擾動,終態位置不準。先 flyTo 一次給用戶即時回饋,再於轉場結束後補一次
    // easeTo 校正中心。手機則一律帶入 sheet 的 padding,讓咖啡廳落在可見區域中心。
    map.flyTo({
      center: [cafe.lng, cafe.lat],
      zoom: 15,
      duration: 600,
      padding: { top: 0, right: 0, bottom: paddingBottom, left: 0 },
    });
    const t = window.setTimeout(() => {
      map.easeTo({
        center: [cafe.lng, cafe.lat],
        duration: 250,
        padding: { top: 0, right: 0, bottom: paddingBottom, left: 0 },
      });
    }, 360);
    return () => window.clearTimeout(t);
  }, [activeId, cafes, paddingBottom]);

  if (!hasMapboxToken) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-base-200 p-6 text-center text-sm text-base-content/55 ${className ?? ""}`}
      >
        <div>
          <p className="font-mono text-xs uppercase tracking-widest">no mapbox token</p>
          <p className="mt-2">把 VITE_MAPBOX_TOKEN 填到 .env 後即可看到地圖。</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      <div ref={container} className="h-full w-full" />
      <div className="absolute right-2.5 top-2.5 z-10 flex flex-col gap-2">
        {/* 縮放按鈕組 */}
        <div className="flex flex-col rounded-lg shadow-md border border-base-content/10 overflow-hidden bg-base-100">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            className="btn btn-square btn-sm border-0 bg-base-100 text-base-content hover:bg-base-200 transition-colors duration-200 rounded-none h-8 w-8"
            aria-label="放大"
            title="放大"
          >
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} />
          </button>
          <div className="h-[1px] bg-base-content/10 w-full" />
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            className="btn btn-square btn-sm border-0 bg-base-100 text-base-content hover:bg-base-200 transition-colors duration-200 rounded-none h-8 w-8"
            aria-label="縮小"
            title="縮小"
          >
            <HugeiconsIcon icon={Remove01Icon} size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* 定位按鈕 */}
        <button
          type="button"
          onClick={handleLocateClick}
          className="btn btn-square btn-sm border border-base-content/10 bg-base-100 shadow-md text-base-content hover:bg-base-200 transition-colors duration-200 h-8 w-8"
          aria-label="回到現在位置"
          title="回到現在位置"
        >
          {isLocationLoading ? (
            <span className="loading loading-spinner loading-xs text-base-content/70" />
          ) : (
            <HugeiconsIcon icon={Navigation03Icon} size={16} strokeWidth={1.5} />
          )}
        </button>
      </div>
    </div>
  );
}
