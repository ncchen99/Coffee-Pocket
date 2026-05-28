import React, { createContext, useContext, useEffect, useState } from "react";

interface Coords {
  lng: number;
  lat: number;
}

interface UserLocationContextType {
  location: Coords | null;
  permissionStatus: "granted" | "denied" | "prompt";
  requestLocation: (onSuccess?: (coords: Coords) => void, onError?: () => void) => void;
  isLoading: boolean;
}

const UserLocationContext = createContext<UserLocationContextType | undefined>(undefined);

const PERMISSION_KEY = "cp.location_permission";
const ONBOARDED_KEY = "cp.onboarded";

export function UserLocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<Coords | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<"granted" | "denied" | "prompt">(() => {
    const saved = localStorage.getItem(PERMISSION_KEY);
    if (saved === "granted" || saved === "denied") return saved;
    return "prompt";
  });
  const [isLoading, setIsLoading] = useState(false);

  const requestLocation = (onSuccess?: (coords: Coords) => void, onError?: () => void) => {
    setIsLoading(true);
    if (!navigator.geolocation) {
      setPermissionStatus("denied");
      localStorage.setItem(PERMISSION_KEY, "denied");
      setIsLoading(false);
      onError?.();
      return;
    }

    const startLocate = (highAccuracy: boolean, isFallback: boolean) => {
      // 針對 iOS / WebKit 進行最佳化的定位參數
      const options: PositionOptions = {
        enableHighAccuracy: highAccuracy,
        // 如果是高精度，給予較寬鬆的 15 秒以防 iOS 彈出權限提示時使用者考慮太久導致 timeout
        timeout: highAccuracy ? 15000 : 10000,
        // 高精度時允許使用 10 秒內的快取位置以加速回應，低精度 fallback 時允許 5 分鐘快取
        maximumAge: highAccuracy ? 10000 : 300000,
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lng: position.coords.longitude,
            lat: position.coords.latitude,
          };
          setLocation(coords);
          setPermissionStatus("granted");
          localStorage.setItem(PERMISSION_KEY, "granted");
          setIsLoading(false);
          onSuccess?.(coords);
        },
        (error) => {
          console.warn(
            `Geolocation error (highAccuracy=${highAccuracy}, isFallback=${isFallback}):`,
            error.code,
            error.message
          );

          // 只有當使用者明確拒絕權限 (error.code === 1: PERMISSION_DENIED) 時，
          // 才在 localStorage 與 state 記為 "denied"。
          // 如果是暫時性的訊號問題或 timeout，不應強行阻斷使用者未來的定位嘗試。
          if (error.code === 1) {
            setPermissionStatus("denied");
            localStorage.setItem(PERMISSION_KEY, "denied");
            setLocation(null);
            setIsLoading(false);
            onError?.();
            return;
          }

          // 如果是高精度請求失敗 (timeout 或 position unavailable)，且尚未嘗試 fallback，
          // 則自動降級為低精度 (Wi-Fi / 基地台定位) 再次嘗試，這在室內或 GPS 訊號不佳時極易成功。
          if (highAccuracy && !isFallback) {
            console.log("High accuracy location failed. Retrying with enableHighAccuracy: false...");
            startLocate(false, true);
          } else {
            // 所有嘗試皆失敗 (或者已經是 fallback)
            // 保持原本的 permissionStatus (若先前為 prompt 就維持 prompt)，不強行寫死 denied
            setLocation(null);
            setIsLoading(false);
            onError?.();
          }
        },
        options
      );
    };

    // 啟動首次定位（高精度模式）
    startLocate(true, false);
  };

  // On mount, if the user is already onboarded:
  // Automatically trigger location request (covers refreshing/getting coordinates on reload,
  // and repeated prompt request if previously skipped/denied).
  useEffect(() => {
    const onboarded = localStorage.getItem(ONBOARDED_KEY) === "1";
    if (onboarded) {
      requestLocation();
    }
  }, []);

  return (
    <UserLocationContext.Provider
      value={{
        location,
        permissionStatus,
        requestLocation,
        isLoading,
      }}
    >
      {children}
    </UserLocationContext.Provider>
  );
}

export function useUserLocation() {
  const context = useContext(UserLocationContext);
  if (context === undefined) {
    throw new Error("useUserLocation must be used within a UserLocationProvider");
  }
  return context;
}
