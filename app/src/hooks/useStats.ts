/**
 * Aggregator hook for the Stats feature. Wraps `useActiveChallengeProgress`,
 * joins its live Maps into the shared `VisitEntry[]` once, and memoizes every
 * section's pure computation. The hub and each detail screen all read from this
 * single bundle, so a teaser on the hub can never disagree with its detail page.
 *
 * "Now" is captured once per mount (so the projected-completion date is stable),
 * and every computation keys its memo on the Firestore Map/Set identities the
 * hook hands out — a new snapshot is a new identity, which is exactly when a
 * recompute is warranted.
 */
import { useMemo, useRef } from 'react';
import type { TransportMode } from '@kyuhachi/shared';
import {
  useActiveChallengeProgress,
  type ActiveChallengeProgress,
} from '@/hooks/useActiveChallengeProgress';
import {
  buildVisitEntries,
  computeBudget,
  computeExperience,
  computeGeography,
  computeProgress,
  computeSpendHighlights,
  computeTimeline,
  computeTransport,
  type BudgetResult,
  type ExperienceResult,
  type GeographyResult,
  type ProgressResult,
  type SpendHighlights,
  type TimelineResult,
  type TransportResult,
  type VisitEntry,
} from '@/lib/stats';

export interface StatsBundle extends ActiveChallengeProgress {
  /** True once a challenge is active (the screens' gate for an empty state). */
  hasData: boolean;
  /** Visits joined to onsen info + eligibility, sorted by time. */
  entries: VisitEntry[];
  progress: ProgressResult | null;
  geography: GeographyResult | null;
  timeline: TimelineResult | null;
  transport: TransportResult | null;
  budget: BudgetResult | null;
  spend: SpendHighlights | null;
  experience: ExperienceResult | null;
}

export function useStats(): StatsBundle {
  const base = useActiveChallengeProgress();
  const { challenge, visits, onsenMap, visitedIds, completionCount, eligibleVisitCount, baseMode } =
    base;

  // Stable per-mount "now" so pace/projection don't jitter between renders.
  const nowRef = useRef(Date.now());
  const now = nowRef.current;

  const entries = useMemo<VisitEntry[]>(
    () =>
      challenge
        ? buildVisitEntries({
            visits,
            onsenMap,
            eligibleOnsenIds: challenge.snapshotEligibleOnsenIds,
          })
        : [],
    [challenge, visits, onsenMap]
  );

  const progress = useMemo<ProgressResult | null>(() => {
    if (!challenge) return null;
    return computeProgress({
      completionCount: completionCount ?? 0,
      eligibleVisitCount,
      startDateMs: challenge.startDate.toMillis(),
      completedAtMs: challenge.completedAt?.toMillis() ?? null,
      eligibleVisitMs: entries.filter((e) => e.eligible).map((e) => e.visitedAtMs),
      now,
    });
  }, [challenge, completionCount, eligibleVisitCount, entries, now]);

  const geography = useMemo<GeographyResult | null>(() => {
    if (!challenge) return null;
    return computeGeography({
      entries,
      onsenMap,
      eligibleOnsenIds: challenge.snapshotEligibleOnsenIds,
    });
  }, [challenge, entries, onsenMap]);

  const timeline = useMemo<TimelineResult | null>(
    () => (challenge ? computeTimeline(entries) : null),
    [challenge, entries]
  );

  const transport = useMemo<TransportResult | null>(
    () => (challenge ? computeTransport({ entries, baseMode }) : null),
    [challenge, entries, baseMode]
  );

  const budget = useMemo<BudgetResult | null>(() => {
    if (!challenge) return null;
    const transportByOnsen = new Map<string, TransportMode | null>();
    for (const entry of entries) {
      transportByOnsen.set(entry.onsenId, entry.visit.structuredData.transportMode);
    }
    return computeBudget({
      eligibleOnsenIds: challenge.snapshotEligibleOnsenIds,
      visitedOnsenIds: visitedIds,
      onsenInfo: onsenMap,
      transportByOnsen,
      completionCount: completionCount ?? 0,
    });
  }, [challenge, entries, visitedIds, onsenMap, completionCount]);

  const spend = useMemo<SpendHighlights | null>(() => {
    if (!challenge) return null;
    return computeSpendHighlights({
      entries,
      onsenMap,
      eligibleOnsenIds: challenge.snapshotEligibleOnsenIds,
    });
  }, [challenge, entries, onsenMap]);

  const experience = useMemo<ExperienceResult | null>(
    () => (challenge ? computeExperience(entries) : null),
    [challenge, entries]
  );

  return {
    ...base,
    hasData: challenge !== null,
    entries,
    progress,
    geography,
    timeline,
    transport,
    budget,
    spend,
    experience,
  };
}
