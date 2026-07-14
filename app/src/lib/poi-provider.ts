import type { Poi, PoiCategory } from '@kyuhachi/shared';
import type { LatLng } from '@/lib/geo';
import { MAX_TILES } from '@/lib/finder';
import {
  isLocalSearchAvailable,
  nativeSearch,
  type NativePoi,
} from '../../modules/local-search';

/**
 * How each finder category is queried. Japanese natural-language queries give the
 * best results in Japan; where Apple has an equivalent POI category we also pass
 * it to cut noise. Convenience stores and michi-no-eki have no native category,
 * so they lean on the query alone.
 */
const CATEGORY_SPECS: Record<PoiCategory, { query: string; poiCategories?: string[] }> = {
  convenience_store: { query: 'コンビニ' },
  supermarket: { query: 'スーパーマーケット', poiCategories: ['MKPOICategoryFoodMarket'] },
  hotel: { query: 'ホテル', poiCategories: ['MKPOICategoryHotel'] },
  campsite: { query: 'キャンプ場', poiCategories: ['MKPOICategoryCampground'] },
  michi_no_eki: { query: '道の駅' },
};

/** Apple caps a region search's radius near 50 km. */
const MAX_SEARCH_RADIUS_M = 50_000;

/**
 * Whether the finder can return real results. True when the native MKLocalSearch
 * module is linked; also true in dev (we stand in mock data there). In a release
 * build without the module it is false; callers should show an unavailable state
 * rather than the fabricated mock data, which must never reach a real user.
 */
export const finderSearchAvailable = __DEV__ || isLocalSearchAvailable;

function dedupeKey(p: { name: string; lat: number; lng: number }): string {
  return `${p.name}@${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
}

// Deterministic stand-ins for DEV ONLY, so the UI is buildable without a custom
// native build. Never used in release builds; see rawSearch. Small fixed offsets
// keep them inside a typical corridor so route mode still shows something.
const MOCK_OFFSETS_KM: [number, number][] = [
  [0.05, 0.1],
  [0.2, -0.15],
  [-0.1, 0.25],
  [0.35, 0.05],
  [-0.2, -0.1],
];

function mockSearch(query: string, center: LatLng): NativePoi[] {
  const degPerKm = 0.009;
  const lngScale = degPerKm / Math.cos((center.lat * Math.PI) / 180);
  return MOCK_OFFSETS_KM.map(([dLatKm, dLngKm], i) => ({
    name: `${query} ${i + 1}`,
    lat: center.lat + dLatKm * degPerKm,
    lng: center.lng + dLngKm * lngScale,
    category: '',
  }));
}

async function rawSearch(
  spec: { query: string; poiCategories?: string[] },
  center: LatLng,
  radiusMeters: number
): Promise<NativePoi[]> {
  if (isLocalSearchAvailable) {
    return nativeSearch({
      query: spec.query,
      latitude: center.lat,
      longitude: center.lng,
      radiusMeters,
      categories: spec.poiCategories ?? null,
    });
  }
  // Module absent: mock only in dev; never fabricate data in a release build.
  return __DEV__ ? mockSearch(spec.query, center) : [];
}

/**
 * Search one category across a set of region centres, merging and de-duplicating
 * the results. Tiling is how we widen coverage past Apple's per-request result
 * cap; centres beyond {@link MAX_TILES} are dropped to bound the request count.
 */
export async function searchPois(
  category: PoiCategory,
  centers: LatLng[],
  radiusKm: number
): Promise<Poi[]> {
  const spec = CATEGORY_SPECS[category];
  const tiles = centers.slice(0, MAX_TILES);
  const radiusMeters = Math.min(MAX_SEARCH_RADIUS_M, Math.max(1, radiusKm) * 1000);

  const batches = await Promise.all(tiles.map((c) => rawSearch(spec, c, radiusMeters)));

  const seen = new Map<string, Poi>();
  for (const batch of batches) {
    for (const r of batch) {
      if (!r.name) continue;
      const poi: Poi = { name: r.name, lat: r.lat, lng: r.lng, category };
      const key = dedupeKey(poi);
      if (!seen.has(key)) seen.set(key, poi);
    }
  }
  return Array.from(seen.values());
}
