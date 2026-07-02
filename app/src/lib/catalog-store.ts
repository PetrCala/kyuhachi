import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CachedCatalog, CachedOnsen, OnsenDocument } from '@kyuhachi/shared';

// Versioned key so a future change to the cache shape can move to a new key
// and let the old blob rot, instead of guessing at parsing stale data.
const CATALOG_KEY = 'catalog.cache.v1';

/**
 * Convert a Firestore onsen document into its offline-cache shape: drop the
 * Timestamps (not JSON-serializable, unused by the UI) and fold in the id.
 */
export function toCachedOnsen(id: string, data: OnsenDocument): CachedOnsen {
  const { createdAt, updatedAt, ...rest } = data;
  return { id, ...rest };
}

/**
 * Sorted copy in the order the catalog used to arrive from Firestore
 * (orderBy areaName, name — plain code-point comparison, matching Firestore's
 * UTF-8 ordering), so consumers see a stable, deterministic order.
 */
export function sortCatalog(onsens: CachedOnsen[]): CachedOnsen[] {
  return [...onsens].sort((a, b) => {
    if (a.areaName !== b.areaName) return a.areaName < b.areaName ? -1 : 1;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return 0;
  });
}

/**
 * The catalog stored by the previous session, or null when there is none or
 * the blob is unreadable (treated as "no cache" — the next sync rewrites it).
 */
export async function loadStoredCatalog(): Promise<CachedCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(CATALOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCatalog;
    if (typeof parsed?.version !== 'number' || !Array.isArray(parsed?.onsens)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persist a catalog snapshot for future (possibly offline) sessions. Best
 * effort: the in-memory state is already updated by the caller, and the next
 * version check re-syncs if this write never landed.
 */
export async function storeCatalog(catalog: CachedCatalog): Promise<void> {
  try {
    await AsyncStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
  } catch {
    // Storage unavailable — nothing to do; see above.
  }
}
