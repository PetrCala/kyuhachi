import { requireOptionalNativeModule } from 'expo';

/** A raw result from the native MKLocalSearch bridge. */
export type NativePoi = {
  name: string;
  lat: number;
  lng: number;
  /** Apple POI category raw value (e.g. "MKPOICategoryHotel"), or '' if unclassified. */
  category: string;
};

type LocalSearchNativeModule = {
  search: (
    query: string,
    latitude: number,
    longitude: number,
    radiusMeters: number,
    categories: string[] | null
  ) => Promise<NativePoi[]>;
};

// `requireOptionalNativeModule` returns null (instead of throwing) when the
// native module isn't linked — e.g. in a JS-only build or under tests — so this
// file is always safe to import.
const LocalSearch = requireOptionalNativeModule<LocalSearchNativeModule>('LocalSearch');

/** True when the native MKLocalSearch module is present in the running build. */
export const isLocalSearchAvailable = LocalSearch != null;

/**
 * Search Apple Maps points of interest near a coordinate. Resolves `[]` when the
 * native module isn't available so callers can fall back without special-casing.
 */
export async function nativeSearch(params: {
  query: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  categories?: string[] | null;
}): Promise<NativePoi[]> {
  if (!LocalSearch) return [];
  return LocalSearch.search(
    params.query,
    params.latitude,
    params.longitude,
    params.radiusMeters,
    params.categories ?? null
  );
}
