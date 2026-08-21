import type { JourneyDayDocument, VisitDocument } from '@kyuhachi/shared';
import type { OnsenWithId } from '../types';

/**
 * The handful of numbers the site puts under the layer panel. All of it is
 * derived from data the page has already loaded, so the panel never waits on a
 * fetch of its own and never disagrees with the map.
 *
 * Deliberately narrow. The app computes rating histograms, transport splits and
 * spend from these same visits; that is Petr reading his own trip, and on a page
 * friends open to see where he has got to it would be noise.
 *
 * Nothing here anchors on `challenge.startDate`. That field records when the
 * challenge was created in the app, which was long before the first step, so any
 * "day N" built on it reads as broken. The walk starts at the earliest
 * journey_days document or not at all.
 */
export interface WalkStats {
  /** Total recorded distance, km. See the note at the sum in `computeWalkStats`. */
  km: number | null;
  /** Days with a published track. Not a span, not a streak. */
  days: number | null;
  /** Longest single day, km. Null with one day, where it just restates `km`. */
  longestDayKm: number | null;
  /** Σ recorded time over the days that carry a duration at all. */
  hours: number | null;
  /** Set when `hours` covers only some days, so the panel can say so. */
  hoursPartial: { counted: number; total: number } | null;
  onsensVisited: number | null;
  onsensTarget: number | null;
  prefectures: number | null;
  prefecturesTotal: number | null;
  /** Latest walked day, "YYYY-MM-DD" in JST. Always null while scrubbed. */
  lastRecordedDay: string | null;
  /**
   * Where the scrubbed-to day sits in the walk: n is the 1-based position of
   * the latest recorded day at or before the cutoff among all recorded days,
   * total is how many there are. Null when live, where lastRecordedDay carries
   * the date instead.
   */
  dayOfWalk: { n: number; total: number } | null;
}

/**
 * Every figure that cannot be computed comes back null, never 0. A zero here
 * would render as a confident "0 km walked" while the truth is only that the
 * data has not arrived.
 */
export function computeWalkStats(input: {
  walkedDays: JourneyDayDocument[] | null;
  visits: Map<string, VisitDocument>;
  onsens: Map<string, OnsenWithId> | null;
  eligibleOnsenIds: string[] | null;
  completionCount: number | null;
  /**
   * The timeline cutoff ("YYYY-MM-DD" in JST) when the page is scrubbed to a
   * past day, null or absent when live. The caller passes walkedDays and
   * visits already filtered to the cutoff; this input only shapes the two
   * date-flavoured rows.
   */
  cutoff?: string | null;
  /** Every recorded date, UNfiltered, for the dayOfWalk denominator. */
  allRecordedDates?: string[];
}): WalkStats {
  const days = input.walkedDays != null && input.walkedDays.length > 0 ? input.walkedDays : null;
  const cutoff = input.cutoff ?? null;

  /*
   * Σ of `distanceMeters`, which is the UNTRIMMED recorded day and so is longer
   * than the line the map draws. Never show the drawn line's length beside it,
   * and never add a "trimmed for privacy" figure: the difference between the two
   * is exactly how far the walking continued past the visible endpoint, which
   * sharpens the 500 m privacy disc into a much smaller guess at where Petr
   * slept. One measure only.
   */
  const km = days ? days.reduce((sum, day) => sum + day.distanceMeters, 0) / 1000 : null;

  /*
   * The document count and nothing else. A day with no document is not a rest
   * day: a track that trims below two points is dropped entirely, so absence
   * says nothing either way. Hence no streaks, no rest days, no share of a
   * calendar.
   */
  const dayCount = days ? days.length : null;

  const longestDayKm =
    days && days.length > 1 ? Math.max(...days.map((day) => day.distanceMeters)) / 1000 : null;

  // A track exported without timestamps lands as durationSeconds 0. Counting
  // those would quietly drag the total down as if he had walked them instantly.
  const timed = days ? days.filter((day) => day.durationSeconds > 0) : [];
  const hours =
    timed.length > 0 ? timed.reduce((sum, day) => sum + day.durationSeconds, 0) / 3600 : null;
  const hoursPartial =
    days && hours != null && timed.length < days.length
      ? { counted: timed.length, total: days.length }
      : null;

  /*
   * Until the eligible pool loads, every recorded visit counts. The pool only
   * ever removes visits from this number, so the interim figure is an upper
   * bound rather than an invention, and it beats blanking the row on a page
   * whose visits arrive live but whose challenge_types read is per page load.
   */
  const pool =
    input.eligibleOnsenIds != null && input.eligibleOnsenIds.length > 0
      ? new Set(input.eligibleOnsenIds)
      : null;
  const visitedIds = [...input.visits.keys()].filter((id) => pool == null || pool.has(id));

  /*
   * While scrubbed, "day n of m" takes over from the last-recorded-day row.
   * Keeping both would print a date that either restates the cutoff the scrub
   * pill already names or, across rest days, quietly contradicts it.
   */
  const allDates = input.allRecordedDates ?? [];
  const position = cutoff != null ? allDates.filter((date) => date <= cutoff).length : 0;

  return {
    km,
    days: dayCount,
    longestDayKm,
    hours,
    hoursPartial,
    onsensVisited: visitedIds.length > 0 ? visitedIds.length : null,
    onsensTarget:
      input.completionCount != null && input.completionCount > 0 ? input.completionCount : null,
    prefectures: countPrefectures(visitedIds, input.onsens),
    // Denominator derived from the pool, never a hardcoded 7: the pool defines
    // the challenge and a catalog publish can change which prefectures it spans.
    prefecturesTotal: countPrefectures(input.eligibleOnsenIds ?? [], input.onsens),
    lastRecordedDay:
      cutoff == null && days
        ? days.reduce((latest, day) => maxDay(latest, day.date), days[0].date)
        : null,
    dayOfWalk: position > 0 ? { n: position, total: allDates.length } : null,
  };
}

/** Distinct prefectures over onsen ids that the catalog can resolve. */
function countPrefectures(ids: string[], onsens: Map<string, OnsenWithId> | null): number | null {
  if (!onsens) return null;
  const prefectures = new Set<string>();
  for (const id of ids) {
    const prefecture = onsens.get(id)?.prefecture;
    if (prefecture) prefectures.add(prefecture);
  }
  return prefectures.size > 0 ? prefectures.size : null;
}

/** ISO days compare lexicographically, so the query order need not be trusted. */
function maxDay(a: string, b: string): string {
  return b > a ? b : a;
}
