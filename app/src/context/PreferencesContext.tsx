import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Default radius for the "Near you" onsen section. */
export const DEFAULT_NEAR_RADIUS_KM = 20;

/** Selectable radii (km) for the "Near you" section. */
export const NEAR_RADIUS_OPTIONS_KM = [5, 10, 20, 30, 50] as const;

/** Default radius for the map's "Near route" filter. */
export const DEFAULT_NEAR_ROUTE_RADIUS_KM = 2;

/** Selectable radii (km) for the map's "Near route" filter (walk/ride scale). */
export const NEAR_ROUTE_RADIUS_OPTIONS_KM = [1, 2, 5, 10] as const;

// AsyncStorage keys; mirrors the 'settings.' prefix used for the language choice.
const SHOW_NEARBY_KEY = 'settings.nearby.show';
const RADIUS_KEY = 'settings.nearby.radiusKm';
const ONSEN_MAP_PREVIEW_KEY = 'settings.onsen.mapPreview';
const NEAR_ROUTE_RADIUS_KEY = 'settings.nearRoute.radiusKm';

interface PreferencesContextValue {
  /** Whether the onsen list shows the distance-sorted "Near you" section. */
  showNearby: boolean;
  /** Radius (km) for the "Near you" section. */
  nearRadiusKm: number;
  /**
   * How an onsen page offers "see this on the map". `true` (default) embeds a
   * tappable mini-map preview in the page body; `false` shows a compact map icon
   * in the header instead. Either way the tap focuses that onsen on the Map tab.
   */
  showOnsenMapPreview: boolean;
  /** Radius (km) for the map's "Near route" filter. */
  nearRouteRadiusKm: number;
  /** False until the stored values have been read, so callers can avoid acting on defaults. */
  loaded: boolean;
  setShowNearby: (value: boolean) => void;
  setNearRadiusKm: (value: number) => void;
  setShowOnsenMapPreview: (value: boolean) => void;
  setNearRouteRadiusKm: (value: number) => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  showNearby: true,
  nearRadiusKm: DEFAULT_NEAR_RADIUS_KM,
  showOnsenMapPreview: true,
  nearRouteRadiusKm: DEFAULT_NEAR_ROUTE_RADIUS_KM,
  loaded: false,
  setShowNearby: () => {},
  setNearRadiusKm: () => {},
  setShowOnsenMapPreview: () => {},
  setNearRouteRadiusKm: () => {},
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [showNearby, setShowNearbyState] = useState(true);
  const [nearRadiusKm, setNearRadiusKmState] = useState<number>(DEFAULT_NEAR_RADIUS_KM);
  const [showOnsenMapPreview, setShowOnsenMapPreviewState] = useState(true);
  const [nearRouteRadiusKm, setNearRouteRadiusKmState] = useState<number>(
    DEFAULT_NEAR_ROUTE_RADIUS_KM
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [[, show], [, radius], [, mapPreview], [, routeRadius]] =
          await AsyncStorage.multiGet([
            SHOW_NEARBY_KEY,
            RADIUS_KEY,
            ONSEN_MAP_PREVIEW_KEY,
            NEAR_ROUTE_RADIUS_KEY,
          ]);
        if (cancelled) return;
        if (show !== null) setShowNearbyState(show !== 'false');
        const parsed = radius !== null ? Number(radius) : NaN;
        if (Number.isFinite(parsed)) setNearRadiusKmState(parsed);
        if (mapPreview !== null) setShowOnsenMapPreviewState(mapPreview !== 'false');
        const parsedRoute = routeRadius !== null ? Number(routeRadius) : NaN;
        if (Number.isFinite(parsedRoute)) setNearRouteRadiusKmState(parsedRoute);
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

  const setShowOnsenMapPreview = (value: boolean) => {
    setShowOnsenMapPreviewState(value);
    AsyncStorage.setItem(ONSEN_MAP_PREVIEW_KEY, value ? 'true' : 'false').catch(() => {});
  };

  const setNearRouteRadiusKm = (value: number) => {
    setNearRouteRadiusKmState(value);
    AsyncStorage.setItem(NEAR_ROUTE_RADIUS_KEY, String(value)).catch(() => {});
  };

  return (
    <PreferencesContext.Provider
      value={{
        showNearby,
        nearRadiusKm,
        showOnsenMapPreview,
        nearRouteRadiusKm,
        loaded,
        setShowNearby,
        setNearRadiusKm,
        setShowOnsenMapPreview,
        setNearRouteRadiusKm,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext);
}
