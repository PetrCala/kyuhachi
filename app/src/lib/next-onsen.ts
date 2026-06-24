import { haversineKm } from '@/lib/geo';

export interface NextOnsenCandidate {
  id: string;
  name: string;
  areaName: string;
  prefecture: string;
  lat: number;
  lng: number;
}

export type NearestOnsen = NextOnsenCandidate & { distanceKm: number };

/** The display fields the "nearest unvisited" card needs from an eligible onsen. */
type OnsenInfo = Pick<NextOnsenCandidate, 'name' | 'areaName' | 'prefecture' | 'lat' | 'lng'>;

/**
 * Eligible onsens for the active challenge that the user hasn't visited yet,
 * joined with their display info. Eligible ids missing from `onsenInfo` (their
 * catalog doc hasn't loaded) are skipped — they reappear once the data arrives.
 */
export function buildNextCandidates(
  eligibleOnsenIds: string[],
  visitedOnsenIds: ReadonlySet<string>,
  onsenInfo: ReadonlyMap<string, OnsenInfo>
): NextOnsenCandidate[] {
  const candidates: NextOnsenCandidate[] = [];
  for (const id of eligibleOnsenIds) {
    if (visitedOnsenIds.has(id)) continue;
    const info = onsenInfo.get(id);
    if (!info) continue;
    candidates.push({
      id,
      name: info.name,
      areaName: info.areaName,
      prefecture: info.prefecture,
      lat: info.lat,
      lng: info.lng,
    });
  }
  return candidates;
}

/**
 * The `count` candidates closest to `origin`, nearest first, each tagged with
 * its great-circle distance in kilometres.
 */
export function selectNearest(
  origin: { lat: number; lng: number },
  candidates: NextOnsenCandidate[],
  count: number
): NearestOnsen[] {
  return candidates
    .map((c) => ({ ...c, distanceKm: haversineKm(origin, { lat: c.lat, lng: c.lng }) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, count);
}
