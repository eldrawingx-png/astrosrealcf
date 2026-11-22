import { useCallback, useEffect, useState } from 'react';

interface AstroBotAndroidInterface {
  isNativeAndroid: () => boolean;
  getAppVersion: () => string;
  getServerUrl: () => string;
  setServerUrl: (url: string) => void;
  useUsbLocalServer: () => void;
  useCloudServer: () => void;
  setKeepScreenOn: (enabled: boolean) => void;
  vibrate: (durationMs: number) => void;
}

declare global {
  interface Window {
    AstroBotAndroid?: AstroBotAndroidInterface;
  }
}

export function useAndroidBridge() {
  const [isNativeAndroid, setIsNativeAndroid] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [serverUrl, setServerUrlState] = useState<string>('');

  useEffect(() => {
    const bridge = window.AstroBotAndroid;
    if (bridge && typeof bridge.isNativeAndroid === 'function' && bridge.isNativeAndroid()) {
      setIsNativeAndroid(true);
      try {
        setAppVersion(bridge.getAppVersion());
        setServerUrlState(bridge.getServerUrl());
      } catch {
        // Ignore bridge read errors
      }
    }
  }, []);

  const setKeepScreenOn = useCallback((enabled: boolean) => {
    try {
      window.AstroBotAndroid?.setKeepScreenOn(enabled);
    } catch {
      // No-op outside native APK
    }
  }, []);

  const vibrate = useCallback((durationMs = 35) => {
    try {
      if (window.AstroBotAndroid?.vibrate) {
        window.AstroBotAndroid.vibrate(durationMs);
      } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(durationMs);
      }
    } catch {
      // Ignore if vibration is restricted
    }
  }, []);

  const setServerUrl = useCallback((url: string) => {
    try {
      window.AstroBotAndroid?.setServerUrl(url);
      setServerUrlState(url);
    } catch {
      // No-op outside native APK
    }
  }, []);

  const useUsbLocalServer = useCallback(() => {
    try {
      window.AstroBotAndroid?.useUsbLocalServer();
    } catch {
      // No-op outside native APK
    }
  }, []);

  const useCloudServer = useCallback(() => {
    try {
      window.AstroBotAndroid?.useCloudServer();
    } catch {
      // No-op outside native APK
    }
  }, []);

  return {
    isNativeAndroid,
    appVersion,
    serverUrl,
    setKeepScreenOn,
    vibrate,
    setServerUrl,
    useUsbLocalServer,
    useCloudServer,
  };
}
