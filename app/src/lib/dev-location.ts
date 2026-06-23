import type { RouteDocument } from '@kyuhachi/shared';

type Coordinate = { latitude: number; longitude: number };

/** Fallback simulated location: the Beppu hot-spring area in Kyushu. */
export const KYUSHU_FALLBACK: Coordinate = { latitude: 33.2846, longitude: 131.4914 };

// Center of the default Kyushu map region (mirrors KYUSHU_REGION in the map screen).
const KYUSHU_CENTER = { lat: 32.8, lng: 130.7 };

function distanceToCenterSq(point: { lat: number; lng: number }): number {
  return (point.lat - KYUSHU_CENTER.lat) ** 2 + (point.lng - KYUSHU_CENTER.lng) ** 2;
}

/**
 * Pick a plausible "current location" in Kyushu for the dev-only location
 * simulator: the middle of the active route when there is one, otherwise the
 * loaded onsen nearest the center of Kyushu, otherwise a fixed fallback.
 * Squared lat/lng distance is good enough for "nearest" at this scale.
 */
export function simulatedCoordinate(
  route: RouteDocument | null,
  onsens: { lat: number; lng: number }[]
): Coordinate {
  if (route?.points?.length) {
    const mid = route.points[Math.floor(route.points.length / 2)];
    return { latitude: mid.lat, longitude: mid.lng };
  }
  if (onsens.length) {
    const nearest = onsens.reduce((best, o) =>
      distanceToCenterSq(o) < distanceToCenterSq(best) ? o : best
    );
    return { latitude: nearest.lat, longitude: nearest.lng };
  }
  return KYUSHU_FALLBACK;
}
