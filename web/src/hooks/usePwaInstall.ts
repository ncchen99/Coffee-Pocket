import { useState, useEffect } from "react";

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if the application is already running in standalone (PWA) mode
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    // Check if the install prompt event was already stashed by early head script
    if ((window as any).deferredPrompt) {
      setInstallPrompt((window as any).deferredPrompt);
    }

    const handlePrompt = (e: any) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
      setInstallPrompt(e);
    };

    const handleInstallable = () => {
      if ((window as any).deferredPrompt) {
        setInstallPrompt((window as any).deferredPrompt);
      }
    };

    // When the app is successfully installed, reset state
    const handleInstalled = () => {
      (window as any).deferredPrompt = null;
      setInstallPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("pwa-installable", handleInstallable);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("pwa-installable", handleInstallable);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    const promptEvent = installPrompt || (window as any).deferredPrompt;
    if (!promptEvent) {
      return false;
    }

    try {
      // Trigger the native installation prompt
      promptEvent.prompt();

      // Wait for the user response
      const { outcome } = await promptEvent.userChoice;

      // Clear the deferred prompt, as it can only be prompted once
      (window as any).deferredPrompt = null;
      setInstallPrompt(null);

      return outcome === "accepted";
    } catch (error) {
      console.error("PWA installation prompt failed:", error);
      return false;
    }
  };

  const isInstallable = (!!installPrompt || !!(window as any).deferredPrompt) && !isStandalone;

  return {
    isInstallable,
    isStandalone,
    install,
  };
}
