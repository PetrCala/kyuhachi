/**
 * Point-to-polyline distance, ported from the app (app/src/lib/geo.ts) so the
 * "planned onsens" layer uses the same proximity idea as the app's
 * along-the-route filtering. Keep the two in sync if the math ever changes.
 */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

/** Metres per degree of latitude (roughly constant everywhere). */
const METRES_PER_DEG_LAT = 111_320;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two coordinates in kilometres (haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Projection of the origin (0,0) onto segment a-b in a local planar frame. */
function projectOriginOntoSegment(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lenSq));
  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

/**
 * Shortest distance in kilometres from a point to a polyline: its closest
 * approach to any *segment*, not merely to the nearest vertex. Simplified
 * tracks can space vertices far apart, so a vertex-only check would wrongly
 * report a point beside a long straight segment as distant.
 */
export function distanceToPolylineKm(point: LatLng, line: LatLng[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return haversineKm(point, line[0]);

  const metresPerDegLng = METRES_PER_DEG_LAT * Math.cos(toRadians(point.lat));
  const project = (c: LatLng) => ({
    x: (c.lng - point.lng) * metresPerDegLng,
    y: (c.lat - point.lat) * METRES_PER_DEG_LAT,
  });

  let minMetres = Infinity;
  let prev = project(line[0]);
  for (let i = 1; i < line.length; i++) {
    const curr = project(line[i]);
    minMetres = Math.min(minMetres, projectOriginOntoSegment(prev, curr));
    prev = curr;
  }
  return minMetres / 1000;
}
