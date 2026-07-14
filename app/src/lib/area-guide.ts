import type { CachedAreaGuide, LocalizedText } from '@kyuhachi/shared';
import { haversineKm, type LatLng } from '@/lib/geo';

/**
 * Pick the string for the current UI language out of a bilingual field. Area
 * guides are authored `{ en, ja }` (a deliberate exception to the no-translate
 * rule for scraped onsen data), so both are always present; Japanese wins for
 * any `ja*` locale, English is the fallback for everything else.
 */
export function pickLocalized(text: LocalizedText, language: string): string {
  return language.startsWith('ja') ? text.ja : text.en;
}

/**
 * The area guide whose centre is closest to the given location, or null when
 * there are no guides. Straight nearest-centre resolution: no polygons, works
 * fully offline over the cached guides. Distances are tiny (one region), so a
 * linear scan is plenty.
 */
export function nearestAreaGuide(
  coords: LatLng,
  guides: CachedAreaGuide[]
): CachedAreaGuide | null {
  let best: CachedAreaGuide | null = null;
  let bestKm = Infinity;
  for (const guide of guides) {
    const km = haversineKm(coords, guide.center);
    if (km < bestKm) {
      bestKm = km;
      best = guide;
    }
  }
  return best;
}
