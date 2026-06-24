/**
 * Progress & pace stats — derived from the eligible-visit count, the challenge
 * start date, and the timestamps of eligible visits. Tier and rank progress are
 * NOT recomputed here: the screen reuses `lib/tier-eligibility.ts`, `lib/rank.ts`
 * and the existing ProgressBar / TierCarousel / RankLadder components.
 */

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 30.4375; // 365.25 / 12

export interface ProgressInput {
  /** Eligible visits required to finish (challenge type `completionCount`). */
  completionCount: number;
  /** Unique eligible-onsen visits so far. */
  eligibleVisitCount: number;
  /** Challenge start, epoch millis. */
  startDateMs: number;
  /** When the challenge completed (server-set), or null. */
  completedAtMs: number | null;
  /** Ascending epoch-millis timestamps of the eligible visits. */
  eligibleVisitMs: number[];
  /** "Now", epoch millis — passed in so the module stays pure/deterministic. */
  now: number;
}

export interface ProgressResult {
  visitsDone: number;
  target: number;
  /** target − done, clamped ≥ 0. */
  remaining: number;
  /** 0–100. */
  percentComplete: number;
  /** Whole days since the challenge started, clamped ≥ 0. */
  daysElapsed: number;
  /** Visiting rate, or null before any visit / on day zero. */
  visitsPerMonth: number | null;
  /** Mean gap between consecutive visits in days, or null with < 2 visits. */
  avgDaysBetweenVisits: number | null;
  /** Projected finish at the current rate, or null when done / no rate yet. */
  projectedCompletionMs: number | null;
  /** Visit count has reached the target. */
  isComplete: boolean;
  /** Days from start to completion, or null until completed. */
  completionDurationDays: number | null;
}

export function computeProgress(input: ProgressInput): ProgressResult {
  const { completionCount, eligibleVisitCount, startDateMs, completedAtMs, eligibleVisitMs, now } =
    input;

  const target = completionCount;
  const visitsDone = eligibleVisitCount;
  const remaining = Math.max(0, target - visitsDone);
  const percentComplete = target > 0 ? Math.min(100, (visitsDone / target) * 100) : 0;
  const daysElapsed = Math.max(0, Math.floor((now - startDateMs) / DAY_MS));
  const isComplete = target > 0 && visitsDone >= target;

  // Pace is measured over the whole challenge (start → now). Needs at least one
  // visit and a non-zero elapsed window; the projection extends that rate over
  // the remaining onsens.
  let visitsPerMonth: number | null = null;
  let projectedCompletionMs: number | null = null;
  if (daysElapsed > 0 && visitsDone > 0) {
    const visitsPerDay = visitsDone / daysElapsed;
    visitsPerMonth = visitsPerDay * DAYS_PER_MONTH;
    if (remaining > 0 && visitsPerDay > 0) {
      projectedCompletionMs = now + (remaining / visitsPerDay) * DAY_MS;
    }
  }

  let avgDaysBetweenVisits: number | null = null;
  if (eligibleVisitMs.length >= 2) {
    const first = eligibleVisitMs[0];
    const last = eligibleVisitMs[eligibleVisitMs.length - 1];
    avgDaysBetweenVisits = (last - first) / (eligibleVisitMs.length - 1) / DAY_MS;
  }

  const completionDurationDays =
    completedAtMs != null ? Math.max(0, Math.floor((completedAtMs - startDateMs) / DAY_MS)) : null;

  return {
    visitsDone,
    target,
    remaining,
    percentComplete,
    daysElapsed,
    visitsPerMonth,
    avgDaysBetweenVisits,
    projectedCompletionMs,
    isComplete,
    completionDurationDays,
  };
}
