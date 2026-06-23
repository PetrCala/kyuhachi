import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

/**
 * One-shot foreground location for the "near you" list section. Requests
 * permission once on mount (iOS only re-prompts if undecided) and resolves the
 * current position. Returns null until/unless a fix is available — callers hide
 * the nearby section when there's no location rather than nagging the user.
 *
 * Pass `enabled = false` to skip the prompt entirely (the onsen list does this
 * in dev, where it stands in a simulated Kyushu location instead).
 */
export function useUserLocation(enabled = true): { lat: number; lng: number } | null {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        }
      } catch {
        // No fix available — leave coords null so no nearby section shows.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return coords;
}
