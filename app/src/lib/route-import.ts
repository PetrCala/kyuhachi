/**
 * Route import: parse an externally-authored GPS track (.gpx/.kml/.tcx) into a
 * simplified coordinate track + metadata ready to store in Firestore.
 *
 * This module is pure (no React, no native modules): the screen handles file
 * picking, reading, and the Firestore write. All three formats go through one
 * path: XML → GeoJSON (via @tmcw/togeojson) → simplified LatLng track.
 */
import { DOMParser } from '@xmldom/xmldom';
import { gpx, kml, tcx } from '@tmcw/togeojson';
import type {
  FeatureCollection,
  Feature,
  Geometry,
  LineString,
  MultiLineString,
  Position,
} from 'geojson';
import type { RouteDocument } from '@kyuhachi/shared';

export type RouteSourceFormat = RouteDocument['sourceFormat']; // "gpx" | "kml" | "tcx"

export type RouteImportErrorCode = 'parse' | 'noTrack';

/** Thrown by {@link parseRoute}; `code` maps to a user-facing i18n key in the screen. */
export class RouteImportError extends Error {
  readonly code: RouteImportErrorCode;
  constructor(code: RouteImportErrorCode) {
    super(code);
    this.name = 'RouteImportError';
    this.code = code;
  }
}

/** Parsed-from-file route data; the writer adds `createdAt`/`updatedAt` server timestamps. */
export type ParsedRoute = Pick<
  RouteDocument,
  'name' | 'sourceFormat' | 'points' | 'pointCount' | 'bounds' | 'distanceMeters'
>;

type LatLng = { lat: number; lng: number };

/** Cap on stored points — keeps the doc well under Firestore's 1 MB limit and the map smooth. */
const MAX_POINTS = 1500;
/** ~1 m in degrees; drops GPS jitter / collinear points without visibly changing the track. */
const BASE_TOLERANCE = 1e-5;
/** Coordinate precision (~0.1 m); trims document size. */
const COORD_DECIMALS = 6;
const ROUND_FACTOR = 10 ** COORD_DECIMALS;
const EARTH_RADIUS_M = 6_371_000;

/** Map a filename to a supported format by its extension, or null if unsupported. */
export function sourceFormatFromName(fileName: string): RouteSourceFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'gpx' || ext === 'kml' || ext === 'tcx') return ext;
  return null;
}

/** Strip the trailing extension from a filename, for use as a fallback route name. */
export function nameWithoutExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/**
 * Parse raw file `text` of the given `format` into a {@link ParsedRoute}.
 * @throws {RouteImportError} `parse` if the XML/GeoJSON is unreadable, `noTrack`
 *   if it contains no usable line geometry.
 */
export function parseRoute(
  text: string,
  format: RouteSourceFormat,
  fallbackName: string
): ParsedRoute {
  const collection = toGeoJson(text, format);
  const track = firstTrackFeature(collection);
  if (!track) throw new RouteImportError('noTrack');

  const rawPoints = trackPoints(track.geometry);
  if (rawPoints.length < 2) throw new RouteImportError('noTrack');

  // Distance is computed from the full-resolution track for accuracy.
  const distanceMeters = totalDistanceMeters(rawPoints);
  const points = simplify(rawPoints).map(roundPoint);

  return {
    name: trackName(track) ?? fallbackName,
    sourceFormat: format,
    points,
    pointCount: points.length,
    bounds: boundsOf(points),
    distanceMeters,
  };
}

function toGeoJson(text: string, format: RouteSourceFormat): FeatureCollection<Geometry | null> {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, 'text/xml') as unknown as Document;
  } catch {
    throw new RouteImportError('parse');
  }
  if (!doc?.documentElement) throw new RouteImportError('parse');
  switch (format) {
    case 'gpx':
      return gpx(doc);
    case 'kml':
      return kml(doc);
    case 'tcx':
      return tcx(doc);
  }
}

function firstTrackFeature(
  collection: FeatureCollection<Geometry | null>
): Feature<LineString | MultiLineString> | null {
  for (const feature of collection.features) {
    const geometry = feature.geometry;
    if (geometry && (geometry.type === 'LineString' || geometry.type === 'MultiLineString')) {
      return feature as Feature<LineString | MultiLineString>;
    }
  }
  return null;
}

function trackPoints(geometry: LineString | MultiLineString): LatLng[] {
  // GeoJSON coordinates are [lng, lat]. MultiLineString segments are concatenated in order.
  const positions: Position[] = [];
  if (geometry.type === 'LineString') {
    positions.push(...geometry.coordinates);
  } else {
    for (const segment of geometry.coordinates) positions.push(...segment);
  }
  const points: LatLng[] = [];
  for (const [lng, lat] of positions) {
    if (Number.isFinite(lat) && Number.isFinite(lng)) points.push({ lat, lng });
  }
  return points;
}

function trackName(feature: Feature<LineString | MultiLineString>): string | null {
  const name = feature.properties?.name;
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
}

/** Douglas–Peucker, then a hard cap via uniform decimation if still too dense. */
function simplify(points: LatLng[]): LatLng[] {
  let tolerance = BASE_TOLERANCE;
  let result = douglasPeucker(points, tolerance);
  while (result.length > MAX_POINTS && tolerance < 1) {
    tolerance *= 2;
    result = douglasPeucker(points, tolerance);
  }
  if (result.length > MAX_POINTS) result = decimate(result, MAX_POINTS);
  return result;
}

/** Iterative Douglas–Peucker (avoids recursion depth on long tracks). Distances in degrees. */
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

function boundsOf(points: LatLng[]): RouteDocument['bounds'] {
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

function totalDistanceMeters(points: LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversineMeters(points[i - 1], points[i]);
  return Math.round(sum);
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
