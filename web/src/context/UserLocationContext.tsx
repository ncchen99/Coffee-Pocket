import React, { createContext, useContext, useEffect, useState } from "react";
import { LocationGuideModal } from "@/components/primitives/LocationGuideModal";

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
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const requestLocation = (
    onSuccess?: (coords: Coords) => void,
    onError?: () => void,
    isUserTriggered = true
  ) => {
    setIsLoading(true);
    if (!navigator.geolocation) {
      setPermissionStatus("denied");
      localStorage.setItem(PERMISSION_KEY, "denied");
      setIsLoading(false);
      onError?.();
      return;
    }

    // 1. 檢查是否處於非安全上下文 (HTTP 且非 localhost)
    // iOS Safari 預設阻擋非安全上下文 (HTTP) 下的定位請求，且會靜默失敗 (不彈窗、不觸發 callback)
    const isNonSecureContext =
      typeof window !== "undefined" &&
      window.location.protocol === "http:" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1";

    if (isNonSecureContext && isUserTriggered) {
      console.warn(
        "Geolocation blocked: Insecure HTTP remote context. iOS/WebKit will silently block geolocation without prompting."
      );
      setIsGuideOpen(true);
      setPermissionStatus("denied");
      localStorage.setItem(PERMISSION_KEY, "denied");
      setIsLoading(false);
      onError?.();
      return;
    }

    const startLocate = (highAccuracy: boolean, isFallback: boolean, triggeredByUser: boolean) => {
      let isResolved = false;

      // 針對 iOS / WebKit 進行最佳化的定位參數
      const apiTimeout = triggeredByUser && permissionStatus === "prompt"
        ? 30000
        : (highAccuracy ? 15000 : 10000);

      const options: PositionOptions = {
        enableHighAccuracy: highAccuracy,
        // 如果是首次提示 (prompt) 且是使用者點擊觸發，給予更寬鬆的 30 秒以防 iOS 彈出權限提示時使用者考慮或操作太久
        // 如果不是首次提示，高精度給予 15 秒，低精度 fallback 給予 10 秒
        timeout: apiTimeout,
        // 允許使用快取位置以加速回應：高精度時允許使用 10 秒內的快取位置，低精度 fallback 時允許 5 分鐘快取
        maximumAge: highAccuracy ? 10000 : 300000,
      };

      // JS 層級的安全計時器，比 API 超時多給 1.5 秒
      // 防範 WebKit 靜默不回報 (不執行 success 也無 error) 導致 loading 永久卡死的 Bug
      const safetyTimer = setTimeout(() => {
        if (isResolved) return;
        isResolved = true;
        console.warn(
          `Geolocation safety timeout triggered (highAccuracy=${highAccuracy}, isFallback=${isFallback})`
        );
        handleError({
          code: 3, // TIMEOUT
          message: "WebKit Geolocation Silent Timeout (Safety protection triggered)",
        } as GeolocationPositionError);
      }, apiTimeout + 1500);

      const handleError = (error: GeolocationPositionError) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(safetyTimer);

        console.warn(
          `Geolocation error (highAccuracy=${highAccuracy}, isFallback=${isFallback}, triggeredByUser=${triggeredByUser}):`,
          error.code,
          error.message
        );

        // 只有當使用者在「使用者手動點擊觸發」的流程中，明確拒絕權限 (error.code === 1: PERMISSION_DENIED) 時，
        // 才在 localStorage 與 state 記為 "denied"。
        if (error.code === 1) {
          if (triggeredByUser) {
            setPermissionStatus("denied");
            localStorage.setItem(PERMISSION_KEY, "denied");
            
            // 使用者點選定位且被系統/瀏覽器明確拒絕時，開啟精美的權限引導對話框
            setIsGuideOpen(true);
          } else {
            // 自動觸發被阻擋時，不要強行寫死 denied，而是保持原本狀態（若原先為 prompt 或 granted 就維持原樣）
            // 也不要將 permissionStatus 改為 denied，這樣未來使用者點選定位按鈕時仍可觸發提示
            setPermissionStatus((prev) => (prev === "denied" ? "denied" : "prompt"));
          }
          setLocation(null);
          setIsLoading(false);
          onError?.();
          return;
        }

        // 如果是高精度請求失敗 (timeout 或 position unavailable)，且尚未嘗試 fallback，
        // 則自動降級為低精度 (Wi-Fi / 基地台定位) 再次嘗試，這在室內或 GPS 訊號不佳時極易成功。
        if (highAccuracy && !isFallback) {
          console.log("High accuracy location failed. Retrying with enableHighAccuracy: false...");
          startLocate(false, true, triggeredByUser);
        } else {
          // 所有嘗試皆失敗 (或者已經是 fallback)
          // 保持原本的 permissionStatus (若先前為 prompt 就維持 prompt)，不強行寫死 denied
          setLocation(null);
          setIsLoading(false);
          onError?.();
        }
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (isResolved) return;
          isResolved = true;
          clearTimeout(safetyTimer);

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
          handleError(error);
        },
        options
      );
    };

    // 啟動首次定位（高精度模式）
    startLocate(true, false, isUserTriggered);
  };

  // On mount:
  // 只有在已完成 onboarding 且先前「明確獲得同意」(granted) 的情況下，才在 mount 時自動請求定位。
  // 這能完美避免在 iOS Safari 上因為頁面載入時沒有 user gesture 而被瀏覽器阻擋，
  // 進而觸發錯誤回呼並誤將狀態寫成 denied 的 Bug。
  useEffect(() => {
    const onboarded = localStorage.getItem(ONBOARDED_KEY) === "1";
    const savedPermission = localStorage.getItem(PERMISSION_KEY);
    if (onboarded && savedPermission === "granted") {
      requestLocation(undefined, undefined, false);
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
      <LocationGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
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
