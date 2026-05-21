import React, { createContext, useContext, useEffect, useState } from "react";

interface Coords {
  lng: number;
  lat: number;
}

interface UserLocationContextType {
  location: Coords | null;
  permissionStatus: "granted" | "denied" | "prompt";
  requestLocation: (onSuccess?: () => void, onError?: () => void) => void;
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

  const requestLocation = (onSuccess?: () => void, onError?: () => void) => {
    setIsLoading(true);
    if (!navigator.geolocation) {
      setPermissionStatus("denied");
      localStorage.setItem(PERMISSION_KEY, "denied");
      setIsLoading(false);
      onError?.();
      return;
    }

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
        onSuccess?.();
      },
      (error) => {
        console.warn("Geolocation permission error/denied:", error);
        setPermissionStatus("denied");
        localStorage.setItem(PERMISSION_KEY, "denied");
        setLocation(null);
        setIsLoading(false);
        onError?.();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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
