/**
 * Finder feature: categories of everyday stops a traveller looks for along a
 * route (food, lodging, roadside stations). These are *not* persisted: results
 * come live from Apple's MKLocalSearch at query time and are never written to
 * Firestore. The types live here so the app and any future provider share one
 * vocabulary.
 */

/** The point-of-interest categories the finder can search for. */
export type PoiCategory =
  | 'convenience_store'
  | 'supermarket'
  | 'hotel'
  | 'campsite'
  | 'michi_no_eki';

/** Canonical, display order of the finder categories. */
export const POI_CATEGORIES: readonly PoiCategory[] = [
  'convenience_store',
  'supermarket',
  'hotel',
  'campsite',
  'michi_no_eki',
] as const;

/**
 * A single search result. `name` comes back already localized from Apple Maps
 * and is shown as-is (no translation). `category` is the category that was
 * searched for, or null if the provider couldn't classify the result.
 */
export interface Poi {
  name: string;
  lat: number;
  lng: number;
  category: PoiCategory | null;
}
