import type { Tier, TransportMode } from '@kyuhachi/shared';
import { isFasterThan } from '@kyuhachi/shared';

/**
 * Client-side tier eligibility: what tier a challenge currently *qualifies*
 * for. This is read-only and advisory: it gates the Claim/Upgrade button, but a
 * tier only becomes earned when the user claims it via the `claimTier` callable,
 * which re-verifies the same conditions server-side before writing `earnedTier`.
 */

/** The per-challenge figures a tier's conditions are checked against. */
export interface TierProgress {
  /** Unique eligible-onsen visit count. */
  eligibleVisits: number;
  /** Eligible visits reached by a mode faster than the challenge's baseMode. */
  shortcutCount: number;
  /** Whole days since the challenge started. */
  daysSinceStart: number;
}

/** Count eligible visits reached faster than `baseMode` (the "shortcuts"). */
export function countShortcuts(
  transportModes: (TransportMode | null)[],
  baseMode: TransportMode | null
): number {
  if (!baseMode) return 0;
  return transportModes.filter((mode) => isFasterThan(mode, baseMode)).length;
}

/** True when every one of the tier's conditions is met by `progress`. */
export function isTierEligible(tier: Tier, progress: TierProgress): boolean {
  return tier.conditions.every((condition) => {
    switch (condition.type) {
      case 'minVisits':
        return progress.eligibleVisits >= condition.value;
      case 'maxFasterVisits':
        return progress.shortcutCount <= condition.value;
      case 'maxCalendarDays':
        return progress.daysSinceStart <= condition.value;
      default:
        return false;
    }
  });
}

/** The best tier currently met. `tiers` must be ordered best → worst. */
export function highestEligibleTier(tiers: Tier[], progress: TierProgress): Tier | null {
  return tiers.find((tier) => isTierEligible(tier, progress)) ?? null;
}
