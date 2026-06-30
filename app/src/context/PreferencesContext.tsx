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

/** Default corridor width for the finder. Tighter than the onsen filter — a
 *  2 km-off-route stop is a 4 km round-trip detour. */
export const DEFAULT_FINDER_CORRIDOR_KM = 1;

/** Selectable corridor widths (km) for the finder. */
export const FINDER_CORRIDOR_OPTIONS_KM = [0.5, 1, 2, 5] as const;

/** Default distance the finder looks ahead along the route. */
export const DEFAULT_FINDER_LOOKAHEAD_KM = 20;

/** Selectable look-ahead distances (km) for the finder. */
export const FINDER_LOOKAHEAD_OPTIONS_KM = [5, 10, 20, 30, 50] as const;

// AsyncStorage keys; mirrors the 'settings.' prefix used for the language choice.
const SHOW_NEARBY_KEY = 'settings.nearby.show';
const RADIUS_KEY = 'settings.nearby.radiusKm';
const ONSEN_MAP_PREVIEW_KEY = 'settings.onsen.mapPreview';
const ONSEN_ROMAJI_KEY = 'settings.onsen.romaji';
const NEAR_ROUTE_RADIUS_KEY = 'settings.nearRoute.radiusKm';
const FINDER_CORRIDOR_KEY = 'settings.finder.corridorKm';
const FINDER_LOOKAHEAD_KEY = 'settings.finder.lookaheadKm';
const STAMP_COLLECT_ANIM_KEY = 'settings.animations.stampCollect';
const PROGRESS_ANIM_KEY = 'settings.animations.progress';

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
  /**
   * Whether onsen names show their romaji (Latin-script) reading beneath the
   * kanji. Default on. Has no effect when the UI language is Japanese — a
   * Japanese reader gets the kanji directly, so the reading is always hidden
   * there regardless of this setting.
   */
  showRomaji: boolean;
  /** Radius (km) for the map's "Near route" filter. */
  nearRouteRadiusKm: number;
  /** Corridor width (km) the finder searches either side of the route. */
  finderCorridorKm: number;
  /** Distance (km) the finder looks ahead along the route. */
  finderLookAheadKm: number;
  /**
   * Whether recording a new visit plays the celebratory stamp-collection
   * animation (the seal flies in over a glow with sparkles). When off, the stamp
   * still appears for the user to claim — it just shows up at once without the
   * flourish. Default on.
   */
  animateStampCollect: boolean;
  /**
   * Whether the home progress hero counts up and the bar fills smoothly when a
   * newly recorded visit raises the eligible-visit count. When off, the new
   * number and fill appear at once. Default off.
   */
  animateProgress: boolean;
  /** False until the stored values have been read, so callers can avoid acting on defaults. */
  loaded: boolean;
  setShowNearby: (value: boolean) => void;
  setNearRadiusKm: (value: number) => void;
  setShowOnsenMapPreview: (value: boolean) => void;
  setShowRomaji: (value: boolean) => void;
  setNearRouteRadiusKm: (value: number) => void;
  setFinderCorridorKm: (value: number) => void;
  setFinderLookAheadKm: (value: number) => void;
  setAnimateStampCollect: (value: boolean) => void;
  setAnimateProgress: (value: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  showNearby: true,
  nearRadiusKm: DEFAULT_NEAR_RADIUS_KM,
  showOnsenMapPreview: true,
  showRomaji: true,
  nearRouteRadiusKm: DEFAULT_NEAR_ROUTE_RADIUS_KM,
  finderCorridorKm: DEFAULT_FINDER_CORRIDOR_KM,
  finderLookAheadKm: DEFAULT_FINDER_LOOKAHEAD_KM,
  animateStampCollect: true,
  animateProgress: false,
  loaded: false,
  setShowNearby: () => {},
  setNearRadiusKm: () => {},
  setShowOnsenMapPreview: () => {},
  setShowRomaji: () => {},
  setNearRouteRadiusKm: () => {},
  setFinderCorridorKm: () => {},
  setFinderLookAheadKm: () => {},
  setAnimateStampCollect: () => {},
  setAnimateProgress: () => {},
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [showNearby, setShowNearbyState] = useState(true);
  const [nearRadiusKm, setNearRadiusKmState] = useState<number>(DEFAULT_NEAR_RADIUS_KM);
  const [showOnsenMapPreview, setShowOnsenMapPreviewState] = useState(true);
  const [showRomaji, setShowRomajiState] = useState(true);
  const [nearRouteRadiusKm, setNearRouteRadiusKmState] = useState<number>(
    DEFAULT_NEAR_ROUTE_RADIUS_KM
  );
  const [finderCorridorKm, setFinderCorridorKmState] = useState<number>(
    DEFAULT_FINDER_CORRIDOR_KM
  );
  const [finderLookAheadKm, setFinderLookAheadKmState] = useState<number>(
    DEFAULT_FINDER_LOOKAHEAD_KM
  );
  const [animateStampCollect, setAnimateStampCollectState] = useState(true);
  const [animateProgress, setAnimateProgressState] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          [, show],
          [, radius],
          [, mapPreview],
          [, romaji],
          [, routeRadius],
          [, finderCorridor],
          [, finderLookahead],
          [, stampAnim],
          [, progressAnim],
        ] = await AsyncStorage.multiGet([
          SHOW_NEARBY_KEY,
          RADIUS_KEY,
          ONSEN_MAP_PREVIEW_KEY,
          ONSEN_ROMAJI_KEY,
          NEAR_ROUTE_RADIUS_KEY,
          FINDER_CORRIDOR_KEY,
          FINDER_LOOKAHEAD_KEY,
          STAMP_COLLECT_ANIM_KEY,
          PROGRESS_ANIM_KEY,
        ]);
        if (cancelled) return;
        if (show !== null) setShowNearbyState(show !== 'false');
        const parsed = radius !== null ? Number(radius) : NaN;
        if (Number.isFinite(parsed)) setNearRadiusKmState(parsed);
        if (mapPreview !== null) setShowOnsenMapPreviewState(mapPreview !== 'false');
        if (romaji !== null) setShowRomajiState(romaji !== 'false');
        const parsedRoute = routeRadius !== null ? Number(routeRadius) : NaN;
        if (Number.isFinite(parsedRoute)) setNearRouteRadiusKmState(parsedRoute);
        const parsedCorridor = finderCorridor !== null ? Number(finderCorridor) : NaN;
        if (Number.isFinite(parsedCorridor)) setFinderCorridorKmState(parsedCorridor);
        const parsedLookahead = finderLookahead !== null ? Number(finderLookahead) : NaN;
        if (Number.isFinite(parsedLookahead)) setFinderLookAheadKmState(parsedLookahead);
        if (stampAnim !== null) setAnimateStampCollectState(stampAnim !== 'false');
        if (progressAnim !== null) setAnimateProgressState(progressAnim !== 'false');
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

  const setShowRomaji = (value: boolean) => {
    setShowRomajiState(value);
    AsyncStorage.setItem(ONSEN_ROMAJI_KEY, value ? 'true' : 'false').catch(() => {});
  };

  const setNearRouteRadiusKm = (value: number) => {
    setNearRouteRadiusKmState(value);
    AsyncStorage.setItem(NEAR_ROUTE_RADIUS_KEY, String(value)).catch(() => {});
  };

  const setFinderCorridorKm = (value: number) => {
    setFinderCorridorKmState(value);
    AsyncStorage.setItem(FINDER_CORRIDOR_KEY, String(value)).catch(() => {});
  };

  const setFinderLookAheadKm = (value: number) => {
    setFinderLookAheadKmState(value);
    AsyncStorage.setItem(FINDER_LOOKAHEAD_KEY, String(value)).catch(() => {});
  };

  const setAnimateStampCollect = (value: boolean) => {
    setAnimateStampCollectState(value);
    AsyncStorage.setItem(STAMP_COLLECT_ANIM_KEY, value ? 'true' : 'false').catch(() => {});
  };

  const setAnimateProgress = (value: boolean) => {
    setAnimateProgressState(value);
    AsyncStorage.setItem(PROGRESS_ANIM_KEY, value ? 'true' : 'false').catch(() => {});
  };

  return (
    <PreferencesContext.Provider
      value={{
        showNearby,
        nearRadiusKm,
        showOnsenMapPreview,
        showRomaji,
        nearRouteRadiusKm,
        finderCorridorKm,
        finderLookAheadKm,
        animateStampCollect,
        animateProgress,
        loaded,
        setShowNearby,
        setNearRadiusKm,
        setShowOnsenMapPreview,
        setShowRomaji,
        setNearRouteRadiusKm,
        setFinderCorridorKm,
        setFinderLookAheadKm,
        setAnimateStampCollect,
        setAnimateProgress,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext);
}
