/**
 * Timeline stats — cumulative growth, calendar breakdowns, streaks and gaps.
 *
 * Calendar bucketing (which day/month/season a visit lands in) is timezone
 * dependent, so the date→parts function is injected (`toParts`, device-local by
 * default) and tests pin it for determinism. Streak/gap maths run on UTC-parsed
 * day keys so they don't drift with the host timezone.
 */
import type { VisitEntry } from './shared';

const DAY_MS = 86_400_000;

export interface DateParts {
  year: number;
  /** 1–12. */
  month: number;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  /** `YYYY-MM-DD` in the bucketing timezone. */
  dateKey: string;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Device-local calendar parts for an epoch-millis instant. */
export function localDateParts(ms: number): DateParts {
  const d = new Date(ms);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    dayOfWeek: d.getDay(),
    dateKey: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  };
}

export interface CumulativePoint {
  ms: number;
  count: number;
}

export interface LabeledCount {
  key: string;
  count: number;
}

export interface TimelineResult {
  totalVisits: number;
  /** Running visit total after each visit, in order. */
  cumulative: CumulativePoint[];
  /** Visits per `YYYY-MM`, ascending. */
  byMonth: LabeledCount[];
  /** Visits per `YYYY`, ascending. */
  byYear: LabeledCount[];
  /** Length-7 counts, index 0 = Sunday … 6 = Saturday. */
  byDayOfWeek: number[];
  /** Length-4 counts: [spring, summer, autumn, winter]. */
  bySeason: number[];
  /** The calendar day with the most visits (earliest on a tie), or null. */
  busiestDay: { key: string; count: number } | null;
  /** Longest run of consecutive calendar days each having ≥ 1 visit. */
  longestStreakDays: number;
  /** Largest day-gap between consecutive visit days, or null with < 2 days. */
  longestGapDays: number | null;
  firstVisitMs: number | null;
  latestVisitMs: number | null;
}

/** Month (1–12) → season index: spring 0 (Mar–May), summer 1, autumn 2, winter 3. */
function seasonIndex(month: number): number {
  if (month >= 3 && month <= 5) return 0;
  if (month >= 6 && month <= 8) return 1;
  if (month >= 9 && month <= 11) return 2;
  return 3;
}

export function computeTimeline(
  entries: VisitEntry[],
  toParts: (ms: number) => DateParts = localDateParts
): TimelineResult {
  // Purely temporal — needs only timestamps, so it counts every eligible visit
  // (no onsen-info load required, unlike geography/transport).
  const visited = entries.filter((e) => e.eligible);
  const empty: TimelineResult = {
    totalVisits: 0,
    cumulative: [],
    byMonth: [],
    byYear: [],
    byDayOfWeek: new Array<number>(7).fill(0),
    bySeason: new Array<number>(4).fill(0),
    busiestDay: null,
    longestStreakDays: 0,
    longestGapDays: null,
    firstVisitMs: null,
    latestVisitMs: null,
  };
  if (visited.length === 0) return empty;

  const cumulative: CumulativePoint[] = [];
  const monthCounts = new Map<string, number>();
  const yearCounts = new Map<string, number>();
  const byDayOfWeek = new Array<number>(7).fill(0);
  const bySeason = new Array<number>(4).fill(0);
  const dayCounts = new Map<string, number>();

  visited.forEach((entry, i) => {
    cumulative.push({ ms: entry.visitedAtMs, count: i + 1 });
    const parts = toParts(entry.visitedAtMs);
    const ym = `${parts.year}-${pad(parts.month)}`;
    monthCounts.set(ym, (monthCounts.get(ym) ?? 0) + 1);
    yearCounts.set(`${parts.year}`, (yearCounts.get(`${parts.year}`) ?? 0) + 1);
    byDayOfWeek[parts.dayOfWeek] += 1;
    bySeason[seasonIndex(parts.month)] += 1;
    dayCounts.set(parts.dateKey, (dayCounts.get(parts.dateKey) ?? 0) + 1);
  });

  const busiestDay = Array.from(dayCounts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))[0];

  const { streak, gap } = streakAndGap(Array.from(dayCounts.keys()));

  return {
    totalVisits: visited.length,
    cumulative,
    byMonth: toSortedCounts(monthCounts),
    byYear: toSortedCounts(yearCounts),
    byDayOfWeek,
    bySeason,
    busiestDay: busiestDay ?? null,
    longestStreakDays: streak,
    longestGapDays: gap,
    firstVisitMs: visited[0].visitedAtMs,
    latestVisitMs: visited[visited.length - 1].visitedAtMs,
  };
}

function toSortedCounts(counts: Map<string, number>): LabeledCount[] {
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Longest consecutive-day streak and longest day-gap from a set of `YYYY-MM-DD`
 * keys. Keys parse as UTC midnight so the integer day numbers are timezone-stable.
 */
function streakAndGap(dateKeys: string[]): { streak: number; gap: number | null } {
  if (dateKeys.length === 0) return { streak: 0, gap: null };
  const days = dateKeys
    .map((key) => Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS))
    .sort((a, b) => a - b);

  let streak = 1;
  let bestStreak = 1;
  let gap: number | null = days.length >= 2 ? 0 : null;
  for (let i = 1; i < days.length; i++) {
    const delta = days[i] - days[i - 1];
    if (delta === 1) {
      streak += 1;
    } else {
      streak = 1;
    }
    if (streak > bestStreak) bestStreak = streak;
    if (gap === null || delta > gap) gap = delta;
  }
  return { streak: bestStreak, gap };
}
