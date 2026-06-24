/**
 * Spend highlights — the named superlatives that complement the aggregate
 * `computeBudget` numbers on the Budget screen (cheapest/dearest visited, the
 * priciest onsen still to come, and the best value-for-money visits).
 *
 * These live here rather than in `lib/budget.ts` because they need data that the
 * stable `computeBudget` input doesn't carry: the onsen *name* (to display the
 * pick) and the per-visit `valueRating` (to rank value for money). `VisitEntry`
 * already joins both, so the highlights ride on the same primitive as every
 * other stats module while `computeBudget` stays untouched.
 */
import { eligibleWithOnsen, type StatsOnsenInfo, type VisitEntry } from './shared';

export interface SpendItem {
  onsenId: string;
  name: string;
  fee: number;
}

export interface ValueLeader extends SpendItem {
  /** The visit's value-for-money rating, 1–10. */
  rating: number;
}

export interface SpendHighlights {
  /** Cheapest priced eligible onsen visited, or null. */
  cheapestVisited: SpendItem | null;
  /** Most expensive priced eligible onsen visited, or null. */
  dearestVisited: SpendItem | null;
  /** Most expensive priced eligible onsen NOT yet visited, or null. */
  dearestRemaining: SpendItem | null;
  /** Best value-for-money visits (high valueRating), priced, up to `limit`. */
  valueLeaders: ValueLeader[];
}

export interface SpendHighlightsInput {
  entries: VisitEntry[];
  onsenMap: ReadonlyMap<string, StatsOnsenInfo>;
  eligibleOnsenIds: readonly string[];
  /** How many value leaders to surface. */
  limit?: number;
}

export function computeSpendHighlights(input: SpendHighlightsInput): SpendHighlights {
  const limit = input.limit ?? 3;
  const visited = eligibleWithOnsen(input.entries);

  const pricedVisited: SpendItem[] = [];
  const valueLeaders: ValueLeader[] = [];
  const visitedIds = new Set<string>();
  for (const entry of visited) {
    visitedIds.add(entry.onsenId);
    const fee = entry.onsen!.adultFee;
    if (fee == null) continue;
    const item: SpendItem = { onsenId: entry.onsenId, name: entry.onsen!.name, fee };
    pricedVisited.push(item);
    const rating = entry.visit.structuredData.valueRating;
    if (rating != null) valueLeaders.push({ ...item, rating });
  }

  // Best value for money: highest value rating first, then cheaper fee.
  valueLeaders.sort((a, b) => b.rating - a.rating || a.fee - b.fee);

  let dearestRemaining: SpendItem | null = null;
  for (const id of input.eligibleOnsenIds) {
    if (visitedIds.has(id)) continue;
    const onsen = input.onsenMap.get(id);
    if (!onsen || onsen.adultFee == null) continue;
    if (dearestRemaining === null || onsen.adultFee > dearestRemaining.fee) {
      dearestRemaining = { onsenId: id, name: onsen.name, fee: onsen.adultFee };
    }
  }

  return {
    cheapestVisited: pickFee(pricedVisited, 'min'),
    dearestVisited: pickFee(pricedVisited, 'max'),
    dearestRemaining,
    valueLeaders: valueLeaders.slice(0, limit),
  };
}

function pickFee(items: SpendItem[], which: 'min' | 'max'): SpendItem | null {
  if (items.length === 0) return null;
  return items.reduce((best, item) =>
    which === 'min'
      ? item.fee < best.fee
        ? item
        : best
      : item.fee > best.fee
        ? item
        : best
  );
}
