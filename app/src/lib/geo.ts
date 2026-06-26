export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates in kilometres (haversine).
 * Accurate enough for the "near you" radius; not for navigation.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Metres per degree of latitude (roughly constant everywhere). */
const METRES_PER_DEG_LAT = 111_320;

/** Projection of the origin (0,0) onto segment a–b in a local planar frame.
 *  `t` is the clamped position along the segment (0 = a, 1 = b); `distMetres`
 *  is the distance from the origin to that closest point. */
function projectOriginOntoSegment(
  a: { x: number; y: number },
  b: { x: number; y: number }
): { t: number; distMetres: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  // Degenerate segment (duplicate points) — fall back to the endpoint distance.
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lenSq));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return { t, distMetres: Math.hypot(cx, cy) };
}

/**
 * Shortest distance in kilometres from a point to a polyline — its closest
 * approach to any *segment*, not merely to the nearest vertex. Simplified
 * tracks can space vertices far apart, so a vertex-only check would wrongly
 * report a point beside a long straight segment as distant.
 *
 * Uses a local equirectangular projection centred on the point (longitude
 * scaled by cos(lat)): exact enough at the few-kilometre scale this serves,
 * and far cheaper than per-segment great-circle math.
 */
export function distanceToPolylineKm(point: LatLng, line: LatLng[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return haversineKm(point, line[0]);

  const metresPerDegLng = METRES_PER_DEG_LAT * Math.cos(toRadians(point.lat));
  // Project a coordinate to metres relative to `point` (which sits at the origin).
  const project = (c: LatLng) => ({
    x: (c.lng - point.lng) * metresPerDegLng,
    y: (c.lat - point.lat) * METRES_PER_DEG_LAT,
  });

  let minMetres = Infinity;
  let prev = project(line[0]);
  for (let i = 1; i < line.length; i++) {
    const curr = project(line[i]);
    minMetres = Math.min(minMetres, projectOriginOntoSegment(prev, curr).distMetres);
    prev = curr;
  }
  return minMetres / 1000;
}

/**
 * Cumulative along-track distance in kilometres at each vertex: `out[0]` is 0
 * and `out[i]` is the summed segment length from the start to vertex `i`.
 * The last entry is the polyline's total length. Returns `[]` for an empty line.
 */
export function cumulativeKm(line: LatLng[]): number[] {
  if (line.length === 0) return [];
  const out = new Array<number>(line.length);
  out[0] = 0;
  for (let i = 1; i < line.length; i++) {
    out[i] = out[i - 1] + haversineKm(line[i - 1], line[i]);
  }
  return out;
}

/**
 * Project a point onto a polyline (its nearest approach to any *segment*) and
 * report where that foot sits *along* the line. `alongKm` is the distance from
 * the start of the line to the projected foot, `offsetKm` is the perpendicular
 * distance from the point to the line, and `segmentIndex` is the index of the
 * segment (line[i]→line[i+1]) the foot landed on.
 *
 * This is the primitive the finder uses to order results in route-encounter
 * order: compare each candidate's `alongKm` against the user's own `alongKm`.
 * Pass a precomputed `cumulative` (from {@link cumulativeKm}) to avoid recomputing
 * it across many points on the same line.
 *
 * Degenerate inputs: an empty line yields `offsetKm: Infinity, segmentIndex: -1`;
 * a single-point line yields the haversine distance and `segmentIndex: 0`.
 */
export function projectOntoPolyline(
  point: LatLng,
  line: LatLng[],
  cumulative?: number[]
): { alongKm: number; offsetKm: number; segmentIndex: number } {
  if (line.length === 0) return { alongKm: 0, offsetKm: Infinity, segmentIndex: -1 };
  if (line.length === 1) {
    return { alongKm: 0, offsetKm: haversineKm(point, line[0]), segmentIndex: 0 };
  }

  const cum = cumulative ?? cumulativeKm(line);
  const metresPerDegLng = METRES_PER_DEG_LAT * Math.cos(toRadians(point.lat));
  const project = (c: LatLng) => ({
    x: (c.lng - point.lng) * metresPerDegLng,
    y: (c.lat - point.lat) * METRES_PER_DEG_LAT,
  });

  let best = { alongKm: 0, offsetKm: Infinity, segmentIndex: 0 };
  let prev = project(line[0]);
  for (let i = 1; i < line.length; i++) {
    const curr = project(line[i]);
    const { t, distMetres } = projectOriginOntoSegment(prev, curr);
    const offsetKm = distMetres / 1000;
    if (offsetKm < best.offsetKm) {
      const segLenKm = cum[i] - cum[i - 1];
      best = { alongKm: cum[i - 1] + t * segLenKm, offsetKm, segmentIndex: i - 1 };
    }
    prev = curr;
  }
  return best;
}

/**
 * The coordinate at a given along-track distance (km) from the start of a line,
 * linearly interpolated within the containing segment. `distanceKm` is clamped
 * to `[0, total length]`, so values past either end return the endpoints. Used
 * to lay evenly spaced search centres along the route's look-ahead corridor.
 * Pass a precomputed `cumulative` (from {@link cumulativeKm}) to skip recomputing it.
 */
export function pointAtDistanceKm(
  line: LatLng[],
  distanceKm: number,
  cumulative?: number[]
): LatLng {
  if (line.length === 0) return { lat: 0, lng: 0 };
  if (line.length === 1) return line[0];

  const cum = cumulative ?? cumulativeKm(line);
  const total = cum[cum.length - 1];
  const d = Math.max(0, Math.min(distanceKm, total));

  let i = 1;
  while (i < line.length - 1 && cum[i] < d) i++;
  const segLen = cum[i] - cum[i - 1];
  const t = segLen === 0 ? 0 : (d - cum[i - 1]) / segLen;
  return {
    lat: line[i - 1].lat + t * (line[i].lat - line[i - 1].lat),
    lng: line[i - 1].lng + t * (line[i].lng - line[i - 1].lng),
  };
}
