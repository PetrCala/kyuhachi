import type { Poi } from '@kyuhachi/shared';
import {
  cumulativeKm,
  haversineKm,
  pointAtDistanceKm,
  projectOntoPolyline,
  type LatLng,
} from '@/lib/geo';

/** A search result paired with how it relates to the user. */
export interface FinderResult {
  poi: Poi;
  /** Route-mode: distance further along the route than the user. */
  aheadKm?: number;
  /** Route-mode: perpendicular distance from the route (the detour to reach it). */
  detourKm?: number;
  /** Near-me mode: straight-line distance from the user. */
  awayKm?: number;
}

/** Stable identity for a result — used as the list key and to sync list ↔ map. */
export function finderResultKey(result: FinderResult): string {
  return `${result.poi.name}@${result.poi.lat},${result.poi.lng}`;
}

/** Target spacing between corridor search tiles; trades coverage for request count. */
const TILE_TARGET_KM = 8;
/** Cap on tiles per search — Apple's per-request result limit makes more tiles the
 *  way to widen coverage, but each tile is a network round-trip, so we bound them. */
export const MAX_TILES = 6;
/** MKLocalSearch caps a region request's radius near this; keep tiles under it. */
const MAX_SEARCH_RADIUS_KM = 50;

/**
 * Evenly spaced search centres along the route's look-ahead corridor, plus the
 * radius each one should be searched with. The span runs from the user's
 * position to `lookAheadKm` further along the route (clamped to the route end);
 * `reversed` flips the travel direction so "ahead" means toward the route start.
 * The radius overlaps neighbours and reaches `corridorKm` sideways so the swept
 * area covers the whole corridor.
 */
export function corridorTileCenters(params: {
  route: LatLng[];
  userAlongKm: number;
  lookAheadKm: number;
  corridorKm: number;
  reversed?: boolean;
}): { centers: LatLng[]; radiusKm: number } {
  const { route, userAlongKm, lookAheadKm, corridorKm, reversed = false } = params;
  if (route.length < 2) return { centers: [], radiusKm: 0 };

  const cum = cumulativeKm(route);
  const total = cum[cum.length - 1];
  const spanEnd = Math.min(userAlongKm + lookAheadKm, total);
  const span = Math.max(0, spanEnd - userAlongKm);
  if (span === 0) return { centers: [], radiusKm: 0 };

  const n = Math.max(1, Math.min(MAX_TILES, Math.ceil(span / TILE_TARGET_KM)));
  const spacing = span / n;
  const centers: LatLng[] = [];
  for (let i = 0; i < n; i++) {
    const travelAlong = userAlongKm + (i + 0.5) * spacing;
    const realAlong = reversed ? total - travelAlong : travelAlong;
    centers.push(pointAtDistanceKm(route, realAlong, cum));
  }
  const radiusKm = Math.min(MAX_SEARCH_RADIUS_KM, spacing / 2 + corridorKm);
  return { centers, radiusKm };
}

/** The user's along-route position in travel-direction terms (route start = 0,
 *  increasing the way the user is heading). */
export function userAlongRouteKm(
  user: LatLng,
  route: LatLng[],
  reversed = false
): number {
  if (route.length < 2) return 0;
  const cum = cumulativeKm(route);
  const total = cum[cum.length - 1];
  const along = projectOntoPolyline(user, route, cum).alongKm;
  return reversed ? total - along : along;
}

/**
 * Keep the POIs that sit within `corridorKm` of the route AND ahead of the user
 * (but no further than `lookAheadKm`), ordered by the sequence the user would
 * meet them. `reversed` searches toward the route start instead.
 */
export function orderAlongRoute(params: {
  user: LatLng;
  route: LatLng[];
  pois: Poi[];
  corridorKm: number;
  lookAheadKm: number;
  reversed?: boolean;
}): FinderResult[] {
  const { user, route, pois, corridorKm, lookAheadKm, reversed = false } = params;
  if (route.length < 2) return [];

  const cum = cumulativeKm(route);
  const total = cum[cum.length - 1];
  const userAlong = reversed
    ? total - projectOntoPolyline(user, route, cum).alongKm
    : projectOntoPolyline(user, route, cum).alongKm;

  const results: FinderResult[] = [];
  for (const poi of pois) {
    const proj = projectOntoPolyline({ lat: poi.lat, lng: poi.lng }, route, cum);
    if (proj.offsetKm > corridorKm) continue;
    const along = reversed ? total - proj.alongKm : proj.alongKm;
    const aheadKm = along - userAlong;
    if (aheadKm <= 0 || aheadKm > lookAheadKm) continue;
    results.push({ poi, aheadKm, detourKm: proj.offsetKm });
  }
  results.sort((a, b) => (a.aheadKm ?? 0) - (b.aheadKm ?? 0));
  return results;
}

/** Keep the POIs within `radiusKm` of the user, ordered by straight-line distance. */
export function orderNearMe(params: {
  user: LatLng;
  pois: Poi[];
  radiusKm: number;
}): FinderResult[] {
  const { user, pois, radiusKm } = params;
  return pois
    .map((poi) => ({ poi, awayKm: haversineKm(user, { lat: poi.lat, lng: poi.lng }) }))
    .filter((r) => r.awayKm <= radiusKm)
    .sort((a, b) => a.awayKm - b.awayKm);
}
