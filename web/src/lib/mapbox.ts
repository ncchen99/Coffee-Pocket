export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? "";
export const hasMapboxToken = Boolean(MAPBOX_TOKEN);

// 臺南中西區附近,當作預設地圖中心
export const TAINAN_CENTER: [number, number] = [120.2050, 22.9908];
export const DEFAULT_ZOOM = 13.5;
