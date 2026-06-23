import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Default radius for the "Near you" onsen section. */
export const DEFAULT_NEAR_RADIUS_KM = 20;

/** Selectable radii (km) for the "Near you" section. */
export const NEAR_RADIUS_OPTIONS_KM = [5, 10, 20, 30, 50] as const;

// AsyncStorage keys; mirrors the 'settings.' prefix used for the language choice.
const SHOW_NEARBY_KEY = 'settings.nearby.show';
const RADIUS_KEY = 'settings.nearby.radiusKm';

interface PreferencesContextValue {
  /** Whether the onsen list shows the distance-sorted "Near you" section. */
  showNearby: boolean;
  /** Radius (km) for the "Near you" section. */
  nearRadiusKm: number;
  /** False until the stored values have been read, so callers can avoid acting on defaults. */
  loaded: boolean;
  setShowNearby: (value: boolean) => void;
  setNearRadiusKm: (value: number) => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  showNearby: true,
  nearRadiusKm: DEFAULT_NEAR_RADIUS_KM,
  loaded: false,
  setShowNearby: () => {},
  setNearRadiusKm: () => {},
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [showNearby, setShowNearbyState] = useState(true);
  const [nearRadiusKm, setNearRadiusKmState] = useState<number>(DEFAULT_NEAR_RADIUS_KM);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [[, show], [, radius]] = await AsyncStorage.multiGet([
          SHOW_NEARBY_KEY,
          RADIUS_KEY,
        ]);
        if (cancelled) return;
        if (show !== null) setShowNearbyState(show !== 'false');
        const parsed = radius !== null ? Number(radius) : NaN;
        if (Number.isFinite(parsed)) setNearRadiusKmState(parsed);
      } catch {
        // Storage unavailable — keep defaults.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setShowNearby = (value: boolean) => {
    setShowNearbyState(value);
    AsyncStorage.setItem(SHOW_NEARBY_KEY, value ? 'true' : 'false').catch(() => {});
  };

  const setNearRadiusKm = (value: number) => {
    setNearRadiusKmState(value);
    AsyncStorage.setItem(RADIUS_KEY, String(value)).catch(() => {});
  };

  return (
    <PreferencesContext.Provider
      value={{ showNearby, nearRadiusKm, loaded, setShowNearby, setNearRadiusKm }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext);
}
