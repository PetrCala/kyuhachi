import type { EatInStatus, KonbiniDocument } from '@kyuhachi/shared';
import { konbiniBrandKey, showsEatInBadge } from '@kyuhachi/shared';
import { haversineKm, type LatLng } from '@/lib/geo';

/**
 * How far an Apple Maps result may sit from a /konbini document's coordinate
 * and still be the same store. The two sources pin a shop within a few tens of
 * metres of each other; 120 m absorbs that without reaching the next block.
 */
export const EAT_IN_MATCH_RADIUS_KM = 0.12;

/**
 * The /konbini document an Apple Maps result refers to, or null. Position
 * first, chain as the tie-breaker: two chains often face each other across one
 * intersection, so when both names name a chain they have to agree. A result
 * or document whose name names no chain is matched on position alone.
 */
export function matchKonbini(
  poi: LatLng & { name: string },
  konbini: readonly KonbiniDocument[]
): KonbiniDocument | null {
  const poiBrand = konbiniBrandKey(poi.name);
  let best: KonbiniDocument | null = null;
  let bestKm = Infinity;
  for (const doc of konbini) {
    const km = haversineKm(poi, doc);
    if (km > EAT_IN_MATCH_RADIUS_KM || km >= bestKm) continue;
    const docBrand = konbiniBrandKey(doc.name) ?? (doc.brand ? konbiniBrandKey(doc.brand) : null);
    if (poiBrand && docBrand && poiBrand !== docBrand) continue;
    best = doc;
    bestKm = km;
  }
  return best;
}

/** The i18n key of the badge text for a status that earns a badge. */
export function eatInLabelKey(status: EatInStatus): string {
  return status === 'yes' ? 'finder.eatIn' : 'finder.eatInLikely';
}

/**
 * The eat-in status to badge an Apple Maps result with, or null when there is
 * no matching document or its status earns no badge.
 */
export function eatInBadgeFor(
  poi: LatLng & { name: string },
  konbini: readonly KonbiniDocument[]
): EatInStatus | null {
  const match = matchKonbini(poi, konbini);
  return match && showsEatInBadge(match.eatIn.status) ? match.eatIn.status : null;
}
