/**
 * Geography stats — coverage by prefecture and area, spatial superlatives, and a
 * rough travelled distance. Visited counts come from eligible visits; eligible
 * counts (the denominators) come from projecting the loaded onsen info over the
 * frozen eligible pool, so "X of Y in this prefecture" is honest.
 */
import { eligibleWithOnsen, haversineKm, type StatsOnsenInfo, type VisitEntry } from './shared';

export interface GeoGroup {
  /** Prefecture or area name (`''` for not-yet-loaded onsens). */
  key: string;
  /** Eligible onsens visited in this group. */
  visited: number;
  /** Eligible onsens that exist in this group. */
  eligible: number;
}

export interface GeoExtreme {
  onsenId: string;
  name: string;
  lat: number;
  lng: number;
}

export interface GeographyResult {
  /** Per-prefecture coverage, most-visited first. */
  byPrefecture: GeoGroup[];
  /** Distinct prefectures visited vs distinct prefectures in the eligible pool. */
  prefecturesCovered: { covered: number; total: number };
  /** Per-area coverage, most-visited first. */
  byArea: GeoGroup[];
  northernmost: GeoExtreme | null;
  southernmost: GeoExtreme | null;
  /** Visited onsen farthest from the centroid of visited onsens (needs ≥ 2). */
  mostRemote: GeoExtreme | null;
  /** Σ great-circle distance over visits in chronological order; null with < 2. */
  totalDistanceKm: number | null;
  /** Eligible visits with loaded onsen info (the basis for everything above). */
  totalVisited: number;
}

export interface GeographyInput {
  entries: VisitEntry[];
  onsenMap: ReadonlyMap<string, StatsOnsenInfo>;
  eligibleOnsenIds: readonly string[];
}

export function computeGeography(input: GeographyInput): GeographyResult {
  const visited = eligibleWithOnsen(input.entries);

  const byPrefecture = groupCoverage(
    visited,
    input.onsenMap,
    input.eligibleOnsenIds,
    (o) => o.prefecture
  );
  const byArea = groupCoverage(visited, input.onsenMap, input.eligibleOnsenIds, (o) => o.areaName);

  // X / 7: distinct prefectures visited vs distinct prefectures the eligible
  // pool spans (derived, not a hardcoded 7). Blank prefectures don't count.
  const eligiblePrefs = new Set<string>();
  for (const id of input.eligibleOnsenIds) {
    const pref = input.onsenMap.get(id)?.prefecture;
    if (pref) eligiblePrefs.add(pref);
  }
  const covered = byPrefecture.filter((g) => g.key !== '' && g.visited > 0).length;

  const extremes = spatialExtremes(visited);

  return {
    byPrefecture,
    prefecturesCovered: { covered, total: eligiblePrefs.size },
    byArea,
    ...extremes,
    totalDistanceKm: totalDistance(visited),
    totalVisited: visited.length,
  };
}

/** Group eligible visited + eligible-existing counts by a key selector, busiest first. */
function groupCoverage(
  visited: VisitEntry[],
  onsenMap: ReadonlyMap<string, StatsOnsenInfo>,
  eligibleOnsenIds: readonly string[],
  keyOf: (o: StatsOnsenInfo) => string
): GeoGroup[] {
  const groups = new Map<string, GeoGroup>();
  const ensure = (key: string): GeoGroup => {
    let group = groups.get(key);
    if (!group) {
      group = { key, visited: 0, eligible: 0 };
      groups.set(key, group);
    }
    return group;
  };

  for (const id of eligibleOnsenIds) {
    const onsen = onsenMap.get(id);
    if (!onsen) continue;
    ensure(keyOf(onsen)).eligible += 1;
  }
  for (const entry of visited) {
    ensure(keyOf(entry.onsen!)).visited += 1;
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.visited - a.visited || b.eligible - a.eligible || a.key.localeCompare(b.key)
  );
}

function spatialExtremes(visited: VisitEntry[]): {
  northernmost: GeoExtreme | null;
  southernmost: GeoExtreme | null;
  mostRemote: GeoExtreme | null;
} {
  if (visited.length === 0) {
    return { northernmost: null, southernmost: null, mostRemote: null };
  }

  let north = visited[0];
  let south = visited[0];
  let sumLat = 0;
  let sumLng = 0;
  for (const entry of visited) {
    const o = entry.onsen!;
    if (o.lat > north.onsen!.lat) north = entry;
    if (o.lat < south.onsen!.lat) south = entry;
    sumLat += o.lat;
    sumLng += o.lng;
  }

  let mostRemote: GeoExtreme | null = null;
  if (visited.length >= 2) {
    const centroid = { lat: sumLat / visited.length, lng: sumLng / visited.length };
    let farthest = visited[0];
    let farthestKm = -1;
    for (const entry of visited) {
      const km = haversineKm(entry.onsen!, centroid);
      if (km > farthestKm) {
        farthestKm = km;
        farthest = entry;
      }
    }
    mostRemote = toExtreme(farthest);
  }

  return { northernmost: toExtreme(north), southernmost: toExtreme(south), mostRemote };
}

/** Σ consecutive great-circle hops over chronologically ordered visits. */
function totalDistance(visited: VisitEntry[]): number | null {
  if (visited.length < 2) return null;
  const ordered = [...visited].sort((a, b) => a.visitedAtMs - b.visitedAtMs);
  let km = 0;
  for (let i = 1; i < ordered.length; i++) {
    km += haversineKm(ordered[i - 1].onsen!, ordered[i].onsen!);
  }
  return km;
}

function toExtreme(entry: VisitEntry): GeoExtreme {
  const o = entry.onsen!;
  return { onsenId: entry.onsenId, name: o.name, lat: o.lat, lng: o.lng };
}
