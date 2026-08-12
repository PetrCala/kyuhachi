import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

interface Coords {
  lat: number;
  lng: number;
}

// The last fix this launch, shared by every consumer. A mounting list can then
// paint its "near you" section in its first frame instead of inserting it a
// second later and pushing the rest of the list down.
let cachedCoords: Coords | null = null;

/**
 * Resolve a fix into the shared cache, preferring the OS's last known position
 * (returns immediately) and upgrading to a fresh one when it arrives.
 */
async function resolve(onCoords: (coords: Coords) => void): Promise<void> {
  const last = await Location.getLastKnownPositionAsync();
  if (last) {
    cachedCoords = { lat: last.coords.latitude, lng: last.coords.longitude };
    onCoords(cachedCoords);
  }
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  cachedCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
  onCoords(cachedCoords);
}

/**
 * Start resolving the user's location at launch, but only when permission was
 * already granted in an earlier session: warming the cache must never turn into
 * a permission prompt at app start. The prompt still happens in context, the
 * first time a screen that uses location mounts.
 *
 * Fire-and-forget; screens read whatever has landed via `useUserLocation`.
 */
export function warmUserLocation(): void {
  void (async () => {
    try {
      const { granted } = await Location.getForegroundPermissionsAsync();
      if (!granted) return;
      await resolve(() => {});
    } catch {
      // No fix available: screens fall back to hiding their nearby sections.
    }
  })();
}

/**
 * Foreground location for the "near you" list section. Serves this launch's
 * last fix synchronously (so a remount doesn't re-flow the list), requests
 * permission once on mount if it hasn't been granted yet (iOS only re-prompts
 * if undecided), and resolves the current position. Returns null until/unless a
 * fix is available; callers hide the nearby section when there's no location
 * rather than nagging the user.
 *
 * Pass `enabled = false` to skip the prompt entirely (the onsen list does this
 * in dev, where it stands in a simulated Kyushu location instead).
 */
export function useUserLocation(enabled = true): Coords | null {
  const [coords, setCoords] = useState<Coords | null>(cachedCoords);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        await resolve((next) => {
          if (!cancelled) setCoords(next);
        });
      } catch {
        // No fix available: leave coords null so no nearby section shows.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return coords;
}
