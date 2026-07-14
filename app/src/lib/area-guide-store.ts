import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AreaGuideDocument, CachedAreaGuide, CachedAreaGuides } from '@kyuhachi/shared';

// Versioned key so a future change to the cache shape can move to a new key
// and let the old blob rot, instead of guessing at parsing stale data.
const AREA_GUIDES_KEY = 'area_guides.cache.v1';

/**
 * Convert a Firestore area-guide document into its offline-cache shape: drop the
 * Timestamp (not JSON-serializable, unused by the UI) and fold in the id.
 */
export function toCachedAreaGuide(id: string, data: AreaGuideDocument): CachedAreaGuide {
  const { updatedAt, ...rest } = data;
  return { id, ...rest };
}

/**
 * Sorted copy in a stable, deterministic order (by areaId), so consumers see the
 * same order every launch. Guides are looked up by id or by nearest centre, so
 * the list order is cosmetic; this just keeps it from wobbling.
 */
export function sortAreaGuides(guides: CachedAreaGuide[]): CachedAreaGuide[] {
  return [...guides].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The area guides stored by the previous session, or null when there is none or
 * the blob is unreadable (treated as "no cache": the next sync rewrites it).
 */
export async function loadStoredAreaGuides(): Promise<CachedAreaGuides | null> {
  try {
    const raw = await AsyncStorage.getItem(AREA_GUIDES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAreaGuides;
    if (typeof parsed?.version !== 'number' || !Array.isArray(parsed?.guides)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persist an area-guides snapshot for future (possibly offline) sessions. Best
 * effort: the in-memory state is already updated by the caller, and the next
 * version check re-syncs if this write never landed.
 */
export async function storeAreaGuides(guides: CachedAreaGuides): Promise<void> {
  try {
    await AsyncStorage.setItem(AREA_GUIDES_KEY, JSON.stringify(guides));
  } catch {
    // Storage unavailable; nothing to do (see above).
  }
}
