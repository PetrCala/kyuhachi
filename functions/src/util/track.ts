/**
 * GPS-track utilities for building /journey_days documents: privacy trimming,
 * simplification, distance and bounds. Used by the scheduled Strava sync and
 * the manual GPX import script (scripts/import-journey-gpx.ts).
 *
 * Mirrors the app's route-import pipeline (app/src/lib/route-import.ts): same
 * Douglas-Peucker approach, same point cap and coordinate precision, kept here
 * because Functions is a separate package from the app and `@kyuhachi/shared`.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/**
 * The write shape of /journey_days/{date}. Canonical type:
 * shared/src/types/journey.ts (JourneyDayDocument); keep the two in sync.
 */
export interface JourneyDayData {
  date: string;
  points: LatLng[];
  pointCount: number;
  bounds: Bounds;
  distanceMeters: number;
  durationSeconds: number;
  source: 'strava' | 'gpx';
  stravaActivityId: number | null;
}

/**
 * One continuous recording contributing to a day. Canonical type:
 * shared/src/types/journey.ts (JourneyDayRecording, which carries the same
 * fields over the wire); keep the two in sync.
 */
export interface JourneyDayRecordingInput {
  /** Points in recording order. Trimmed independently of the other recordings. */
  points: LatLng[];
  /** Untrimmed, full-resolution distance of this recording, meters. */
  distanceMeters: number;
  /** Duration of this recording, seconds (moving time where the source has it). */
  durationSeconds: number;
}

export interface BuiltJourneyDay {
  data: JourneyDayData;
  /** Recordings dropped because trimming left fewer than two points. */
  skippedRecordings: number;
}

/**
 * PRIVACY: how close to a track's first/last point counts as "home for the
 * night". Strava's hidden start/end zones only redact what other Strava users
 * see; the owner-token API returns the full track, so this trimming is the
 * only thing keeping overnight locations out of the public documents.
 */
export const TRIM_RADIUS_METERS = 500;

/** Cap on stored points: keeps the doc well under Firestore's 1 MB limit and the map smooth. */
const MAX_POINTS = 1500;
/** ~1 m in degrees; drops GPS jitter / collinear points without visibly changing the track. */
const BASE_TOLERANCE = 1e-5;
/** Coordinate precision (~0.1 m); trims document size. */
const COORD_DECIMALS = 6;
const ROUND_FACTOR = 10 ** COORD_DECIMALS;
const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Full-resolution track length in meters. */
export function totalDistanceMeters(points: LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversineMeters(points[i - 1], points[i]);
  return Math.round(sum);
}

/**
 * Drop the contiguous run of points within `radiusMeters` of the track's first
 * point, and the contiguous run within `radiusMeters` of its last point. Only
 * the leading and trailing runs are dropped: a track that loops back past its
 * start mid-day keeps those middle points. Returns [] when the whole track
 * lies within the two zones (a very short recording): the caller must treat
 * that as "nothing publishable", never fall back to the untrimmed points.
 */
export function trimEnds(points: LatLng[], radiusMeters: number): LatLng[] {
  if (points.length === 0) return [];
  const start = points[0];
  const end = points[points.length - 1];

  let firstKept = 0;
  while (firstKept < points.length && haversineMeters(start, points[firstKept]) < radiusMeters) {
    firstKept++;
  }
  let lastKept = points.length - 1;
  while (lastKept >= 0 && haversineMeters(end, points[lastKept]) < radiusMeters) {
    lastKept--;
  }
  if (firstKept > lastKept) return [];
  return points.slice(firstKept, lastKept + 1);
}

/** Douglas-Peucker, then a hard cap via uniform decimation, then rounding. */
export function simplifyTrack(points: LatLng[]): LatLng[] {
  let tolerance = BASE_TOLERANCE;
  let result = douglasPeucker(points, tolerance);
  while (result.length > MAX_POINTS && tolerance < 1) {
    tolerance *= 2;
    result = douglasPeucker(points, tolerance);
  }
  if (result.length > MAX_POINTS) result = decimate(result, MAX_POINTS);
  return result.map(roundPoint);
}

export function boundsOf(points: LatLng[]): Bounds {
  let { lat: minLat, lng: minLng } = points[0];
  let { lat: maxLat, lng: maxLng } = points[0];
  for (const { lat, lng } of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}

/**
 * Assemble one /journey_days document from a day's recordings.
 *
 * The single place the publishing invariant lives, shared by all three writers
 * (the scheduled Strava sync, the publishJourneyDay callable and the manual
 * import script), so none of them can drift from it: every recording is trimmed
 * independently (each start/stop is a potential overnight or lodging location),
 * the survivors are concatenated in the order given and simplified once, and
 * distance/duration are summed from the untrimmed originals.
 *
 * Returns null when nothing survives trimming. Callers must treat that as
 * "nothing publishable" and write no document; there is no untrimmed fallback.
 */
export function buildJourneyDay(
  date: string,
  recordings: JourneyDayRecordingInput[],
  source: JourneyDayData['source'],
  stravaActivityId: number | null = null
): BuiltJourneyDay | null {
  const points: LatLng[] = [];
  let distanceMeters = 0;
  let durationSeconds = 0;
  let skippedRecordings = 0;

  for (const recording of recordings) {
    const trimmed = trimEnds(recording.points, TRIM_RADIUS_METERS);
    if (trimmed.length < 2) {
      skippedRecordings++;
      continue;
    }
    points.push(...trimmed);
    distanceMeters += recording.distanceMeters;
    durationSeconds += recording.durationSeconds;
  }

  if (points.length < 2) return null;

  const simplified = simplifyTrack(points);
  return {
    data: {
      date,
      points: simplified,
      pointCount: simplified.length,
      bounds: boundsOf(simplified),
      distanceMeters: Math.round(distanceMeters),
      durationSeconds: Math.round(durationSeconds),
      source,
      stravaActivityId,
    },
    skippedRecordings,
  };
}

/** Iterative Douglas-Peucker (avoids recursion depth on long tracks). Distances in degrees. */
function douglasPeucker(points: LatLng[], tolerance: number): LatLng[] {
  const n = points.length;
  if (n <= 2) return points.slice();

  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;

  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const dist = perpendicularDistance(points[i], points[start], points[end]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (index !== -1 && maxDist > tolerance) {
      keep[index] = true;
      stack.push([start, index]);
      stack.push([index, end]);
    }
  }

  const out: LatLng[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

function perpendicularDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return Math.hypot(p.lng - a.lng, p.lat - a.lat);
  const t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy);
  const projX = a.lng + t * dx;
  const projY = a.lat + t * dy;
  return Math.hypot(p.lng - projX, p.lat - projY);
}

/** Uniformly sample down to `max` points, always keeping the first and last. */
function decimate(points: LatLng[], max: number): LatLng[] {
  if (points.length <= max) return points.slice();
  const out: LatLng[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

function roundPoint(p: LatLng): LatLng {
  return {
    lat: Math.round(p.lat * ROUND_FACTOR) / ROUND_FACTOR,
    lng: Math.round(p.lng * ROUND_FACTOR) / ROUND_FACTOR,
  };
}
