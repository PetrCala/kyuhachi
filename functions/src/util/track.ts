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
  /** The track as an encoded polyline; see `encodePolyline`. */
  polyline: string;
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
/**
 * Decimal places kept on a stored coordinate, ~1.1 m. Must equal
 * POLYLINE_PRECISION: the polyline is what gets stored, so rounding to more
 * places than it encodes would leave `bounds` describing a track slightly
 * different from the one the site draws.
 *
 * It was six (~0.1 m) while points were stored as raw numbers. That was always
 * spurious next to a track simplified at a ~1 m tolerance and recorded by a
 * consumer GPS, and it is far below the 500 m privacy trim, so nothing about
 * the trimming invariant depends on it.
 */
const COORD_DECIMALS = 5;
const ROUND_FACTOR = 10 ** COORD_DECIMALS;
const EARTH_RADIUS_M = 6_371_000;

/**
 * Coordinate precision of the encoded polyline, in decimal places.
 * Keep equal to COORD_DECIMALS, and to POLYLINE_PRECISION in the website's
 * decoder (website/src/lib/polyline.ts).
 */
export const POLYLINE_PRECISION = 5;

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
      polyline: encodePolyline(simplified),
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

/**
 * Google's encoded-polyline format: each coordinate is stored as a varint delta
 * from the previous one, in printable ASCII.
 *
 * Why the track is stored this way rather than as an array of {lat, lng}. A day
 * is around a thousand points, and Firestore spends roughly 24 bytes on each
 * one as a map of two doubles, then wraps every one of them again in the
 * protobuf-JSON the web SDK reads: one day went over the wire as ~95 KB. The
 * same track encodes to ~2.6 KB, because consecutive points on a walk are
 * metres apart and a delta that small is two characters. Every walked day is
 * fetched on every page load, so at ~95 KB each the site was heading for
 * megabytes per visit by the end of the walk.
 *
 * Lossless at the precision it is given: the points are already rounded to
 * COORD_DECIMALS before they get here.
 */
export function encodePolyline(points: LatLng[]): string {
  const factor = 10 ** POLYLINE_PRECISION;
  let previousLat = 0;
  let previousLng = 0;
  let out = '';
  for (const point of points) {
    const lat = Math.round(point.lat * factor);
    const lng = Math.round(point.lng * factor);
    out += encodeValue(lat - previousLat) + encodeValue(lng - previousLng);
    previousLat = lat;
    previousLng = lng;
  }
  return out;
}

/**
 * Inverse of `encodePolyline`. Not used in the publish path; it exists so the
 * round trip is testable here, and so the migration script can read a legacy
 * document's points back out. The website carries its own copy.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const factor = 10 ** POLYLINE_PRECISION;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

/** One signed varint, zig-zagged then emitted five bits at a time. */
function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

function roundPoint(p: LatLng): LatLng {
  return {
    lat: Math.round(p.lat * ROUND_FACTOR) / ROUND_FACTOR,
    lng: Math.round(p.lng * ROUND_FACTOR) / ROUND_FACTOR,
  };
}
