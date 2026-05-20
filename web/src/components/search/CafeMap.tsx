import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
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
  onMarkerClick?: (id: string) => void;
  className?: string;
}

/** 共用的 Mapbox 容器,內含 marker 渲染與 active highlight。 */
export function CafeMap({ cafes, activeId, onMarkerClick, className }: CafeMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  // init
  useEffect(() => {
    if (!container.current || mapRef.current || !hasMapboxToken) return;
    const map = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: TAINAN_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    cafes.forEach((c) => {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", c.name);
      el.dataset.cafeId = c.id;
      el.className = "cp-marker";
      el.style.cssText = `
        width: 16px; height: 16px; padding: 0; cursor: pointer;
        border: 1.5px solid currentColor; background: var(--fallback-b1, #FFF8EE);
        color: currentColor;
      `;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onMarkerClick?.(c.id);
      });
      const marker = new mapboxgl.Marker(el).setLngLat([c.lng, c.lat]).addTo(map);
      markersRef.current.set(c.id, marker);
    });
  }, [cafes, onMarkerClick]);

  // highlight active
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement() as HTMLElement;
      if (id === activeId) {
        el.style.background = "var(--fallback-bc, #1B1714)";
        el.style.transform += " scale(1.4)";
      } else {
        el.style.background = "var(--fallback-b1, #FFF8EE)";
      }
    });
    if (activeId && mapRef.current) {
      const cafe = cafes.find((c) => c.id === activeId);
      if (cafe) mapRef.current.flyTo({ center: [cafe.lng, cafe.lat], zoom: 15, duration: 600 });
    }
  }, [activeId, cafes]);

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

  return <div ref={container} className={`h-full w-full ${className ?? ""}`} />;
}
