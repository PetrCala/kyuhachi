import { buildVisitEntries } from '../shared';
import { computeTimeline, type DateParts } from '../timeline';
import { onsen, onsenMap, visit, visitsMap } from '../__fixtures__/factories';

// Pin bucketing to UTC so day/month/season assertions don't drift with the host TZ.
function utcParts(ms: number): DateParts {
  const d = new Date(ms);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    dayOfWeek: d.getUTCDay(),
    dateKey: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
  };
}

const ALL_ELIGIBLE = ['o1', 'o2', 'o3', 'o4', 'o5'];

/** Build a timeline from `[onsenId, UTC-date]` pairs. */
function timelineFor(rows: [string, number][]) {
  const visits = visitsMap(rows.map(([id, ms]) => [id, visit({ visitedAtMs: ms })]));
  const map = onsenMap(Object.fromEntries(rows.map(([id]) => [id, onsen()])));
  const entries = buildVisitEntries({ visits, onsenMap: map, eligibleOnsenIds: ALL_ELIGIBLE });
  return computeTimeline(entries, utcParts);
}

const D = (y: number, m: number, day: number) => Date.UTC(y, m - 1, day);

describe('computeTimeline', () => {
  it('is empty for no visits', () => {
    const r = timelineFor([]);
    expect(r.totalVisits).toBe(0);
    expect(r.cumulative).toEqual([]);
    expect(r.byDayOfWeek).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(r.bySeason).toEqual([0, 0, 0, 0]);
    expect(r.busiestDay).toBeNull();
    expect(r.longestGapDays).toBeNull();
    expect(r.firstVisitMs).toBeNull();
  });

  it('builds cumulative, calendar buckets, and the busiest day', () => {
    const r = timelineFor([
      ['o1', D(2026, 3, 15)], // spring
      ['o2', D(2026, 7, 4)], // summer
      ['o3', D(2026, 7, 4)], // summer, same day → busiest
      ['o4', D(2026, 7, 6)], // summer
      ['o5', D(2026, 12, 25)], // winter
    ]);
    expect(r.totalVisits).toBe(5);
    expect(r.cumulative.map((p) => p.count)).toEqual([1, 2, 3, 4, 5]);
    expect(r.byMonth).toEqual([
      { key: '2026-03', count: 1 },
      { key: '2026-07', count: 3 },
      { key: '2026-12', count: 1 },
    ]);
    expect(r.byYear).toEqual([{ key: '2026', count: 5 }]);
    expect(r.bySeason).toEqual([1, 3, 0, 1]); // spring 1, summer 3, autumn 0, winter 1
    expect(r.busiestDay).toEqual({ key: '2026-07-04', count: 2 });
    expect(r.byDayOfWeek.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it('measures the longest consecutive streak and largest gap', () => {
    const r = timelineFor([
      ['o1', D(2026, 7, 4)],
      ['o2', D(2026, 7, 5)],
      ['o3', D(2026, 7, 6)], // 3-day streak
      ['o4', D(2026, 7, 10)], // gap of 4 days from the 6th
    ]);
    expect(r.longestStreakDays).toBe(3);
    expect(r.longestGapDays).toBe(4);
  });
});
