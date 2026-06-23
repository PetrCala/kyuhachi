/**
 * Deterministic cost/budget model for the Stats screen.
 *
 * Everything here is pure arithmetic over the user's actual visits and the
 * catalog's numeric `adultFee` — no Monte Carlo, no random sampling, no text
 * parsing. The screen feeds it the Maps already subscribed by
 * `useActiveChallengeProgress` (visits + eligible-onsen info), so it does no
 * Firestore access of its own and works fully offline.
 *
 * Fees are integer yen. Onsens with `adultFee: null` (no parseable fee) are
 * excluded from every sum; callers surface the priced-coverage gap via
 * `pricedVisitedCount` of `eligibleVisitedCount`.
 */
import { TRANSPORT_MODES, type TransportMode } from '@kyuhachi/shared';

/** Bucket key for visits whose transport mode was not reported. */
export const UNREPORTED_TRANSPORT = 'unreported';
export type TransportBucket = TransportMode | typeof UNREPORTED_TRANSPORT;

/** Minimal onsen fields the budget needs, keyed by kyuhachiId. */
export interface BudgetOnsenInfo {
  prefecture: string;
  adultFee: number | null;
}

export interface BudgetInput {
  /** Frozen eligible pool for the challenge (`challenge.snapshotEligibleOnsenIds`). */
  eligibleOnsenIds: readonly string[];
  /** Every onsen id visited in the challenge; eligibility is intersected here. */
  visitedOnsenIds: ReadonlySet<string>;
  /** Onsen info keyed by kyuhachiId — covers the eligible onsens that have loaded. */
  onsenInfo: ReadonlyMap<string, BudgetOnsenInfo>;
  /** Reported transport mode per visited onsen (null = unreported). */
  transportByOnsen: ReadonlyMap<string, TransportMode | null>;
  /** Eligible visits required to finish (challenge type `completionCount`, e.g. 88). */
  completionCount: number;
}

export interface SpendGroup<K extends string = string> {
  key: K;
  /** Σ adultFee over priced eligible visits in this group (yen). */
  total: number;
  /** Priced eligible visits contributing to `total`. */
  count: number;
}

export interface BudgetResult {
  /** Eligible onsens visited = |visitedOnsenIds ∩ eligibleOnsenIds|. */
  eligibleVisitedCount: number;
  /** Of those, how many carried a non-null adultFee. */
  pricedVisitedCount: number;
  /** Σ adultFee over priced eligible-visited onsens (yen). */
  spentSoFar: number;
  /** completionCount − eligibleVisitedCount, clamped ≥ 0. */
  remaining: number;
  /** Σ of the `remaining` cheapest priced eligible-unvisited fees (cheapest path to finish). */
  projectedRemaining: number;
  /** How many remaining onsens could actually be priced (≤ remaining). */
  projectedPricedCount: number;
  /** spentSoFar + projectedRemaining (yen). */
  projectedTotal: number;
  /** Mean fee per priced eligible visit (0 when none priced). */
  avgPerVisit: number;
  /** Spend grouped by prefecture, richest first; groups with no priced visit omitted. */
  byPrefecture: SpendGroup[];
  /** Spend grouped by transport mode, in TRANSPORT_MODES order then "unreported". */
  byTransport: SpendGroup<TransportBucket>[];
}

/**
 * Compute the deterministic budget for one challenge.
 *
 * - `spentSoFar` sums fees over the unique eligible onsens already visited.
 * - `projectedRemaining` is the cheapest way left to finish: the sum of the
 *   `remaining` smallest fees among eligible onsens not yet visited.
 * - Breakdowns group the already-spent fees by prefecture and by transport.
 */
export function computeBudget(input: BudgetInput): BudgetResult {
  const { eligibleOnsenIds, visitedOnsenIds, onsenInfo, transportByOnsen, completionCount } = input;

  const eligibleSet = new Set(eligibleOnsenIds);

  let spentSoFar = 0;
  let eligibleVisitedCount = 0;
  let pricedVisitedCount = 0;
  const prefectureTotals = new Map<string, { total: number; count: number }>();
  const transportTotals = new Map<TransportBucket, { total: number; count: number }>();

  for (const id of visitedOnsenIds) {
    if (!eligibleSet.has(id)) continue;
    eligibleVisitedCount += 1;

    const fee = onsenInfo.get(id)?.adultFee ?? null;
    if (fee == null) continue;

    spentSoFar += fee;
    pricedVisitedCount += 1;

    const prefecture = onsenInfo.get(id)?.prefecture ?? '';
    bump(prefectureTotals, prefecture, fee);

    const mode: TransportBucket = transportByOnsen.get(id) ?? UNREPORTED_TRANSPORT;
    bump(transportTotals, mode, fee);
  }

  const remaining = Math.max(0, completionCount - eligibleVisitedCount);

  // Cheapest path to finish: the `remaining` smallest priced fees among eligible
  // onsens not yet visited. Unpriced (null-fee) unvisited onsens can't be costed,
  // so they're left out — projectedPricedCount tells how many we could price.
  const unvisitedFees: number[] = [];
  for (const id of eligibleOnsenIds) {
    if (visitedOnsenIds.has(id)) continue;
    const fee = onsenInfo.get(id)?.adultFee ?? null;
    if (fee != null) unvisitedFees.push(fee);
  }
  unvisitedFees.sort((a, b) => a - b);
  const cheapest = unvisitedFees.slice(0, remaining);
  const projectedRemaining = cheapest.reduce((sum, fee) => sum + fee, 0);
  const projectedPricedCount = cheapest.length;

  const byPrefecture: SpendGroup[] = Array.from(prefectureTotals.entries())
    .map(([key, { total, count }]) => ({ key, total, count }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));

  const transportOrder: TransportBucket[] = [...TRANSPORT_MODES, UNREPORTED_TRANSPORT];
  const byTransport: SpendGroup<TransportBucket>[] = transportOrder
    .filter((mode) => transportTotals.has(mode))
    .map((key) => {
      const entry = transportTotals.get(key)!;
      return { key, total: entry.total, count: entry.count };
    });

  return {
    eligibleVisitedCount,
    pricedVisitedCount,
    spentSoFar,
    remaining,
    projectedRemaining,
    projectedPricedCount,
    projectedTotal: spentSoFar + projectedRemaining,
    avgPerVisit: pricedVisitedCount > 0 ? spentSoFar / pricedVisitedCount : 0,
    byPrefecture,
    byTransport,
  };
}

function bump<K>(map: Map<K, { total: number; count: number }>, key: K, fee: number): void {
  const entry = map.get(key);
  if (entry) {
    entry.total += fee;
    entry.count += 1;
  } else {
    map.set(key, { total: fee, count: 1 });
  }
}

/**
 * Format integer yen for display, e.g. `1234` → `¥1,234`. Rounds first, so it's
 * safe to pass a mean. Implemented without Intl to stay deterministic across
 * the Hermes runtime and tests.
 */
export function formatYen(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}¥${grouped}`;
}
