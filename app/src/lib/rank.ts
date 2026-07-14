import type { Rank } from '@kyuhachi/shared';

/**
 * Client-side rank derivation for the official 九州八十八湯 progression ladder.
 *
 * A rank is purely derived from current progress; there is no claim and nothing
 * persisted (unlike tiers). The user's rank is the highest rung whose thresholds
 * they meet on *both* axes: enough eligible visits AND enough distinct
 * prefectures. Because both thresholds rise monotonically along the ladder,
 * prefecture diversity can hold you back even with visits to spare.
 */

/** The per-challenge figures a rank's thresholds are checked against. */
export interface RankProgress {
  /** Unique eligible-onsen visit count. */
  eligibleVisits: number;
  /** Distinct prefectures represented among those eligible visits. */
  distinctPrefectures: number;
}

/** True when both of a rank's thresholds are met by `progress`. */
export function isRankAchieved(rank: Rank, progress: RankProgress): boolean {
  return (
    progress.eligibleVisits >= rank.minVisits &&
    progress.distinctPrefectures >= rank.minPrefectures
  );
}

/**
 * The highest rank currently achieved, or null when none are met yet.
 * `ranks` must be ordered worst → best with non-decreasing thresholds: once a
 * rung is missed, every rung above it is too, so we stop at the first miss.
 */
export function highestAchievedRank(ranks: Rank[], progress: RankProgress): Rank | null {
  let achieved: Rank | null = null;
  for (const rank of ranks) {
    if (!isRankAchieved(rank, progress)) break;
    achieved = rank;
  }
  return achieved;
}

/**
 * The next rank to aim for (the first not yet achieved), or null at the apex.
 * When no rank is achieved yet this is the lowest rank.
 */
export function nextRankToEarn(ranks: Rank[], progress: RankProgress): Rank | null {
  return ranks.find((rank) => !isRankAchieved(rank, progress)) ?? null;
}
