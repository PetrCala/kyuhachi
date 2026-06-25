import { axisDateFormatter } from '@/lib/stats-format';

const LANG = 'en-US';
/** Local-time millis for a calendar date (month is 1-based here for readability). */
const at = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
const fmt = (ms: number, options: Intl.DateTimeFormatOptions): string =>
  new Date(ms).toLocaleDateString(LANG, options);

describe('axisDateFormatter', () => {
  it('uses day granularity for short spans (≤ ~3 months)', () => {
    const start = at(2026, 6, 1);
    const end = at(2026, 7, 15); // ~44 days
    const format = axisDateFormatter(LANG, start, end);
    expect(format(start)).toBe(fmt(start, { month: 'short', day: 'numeric' }));
  });

  it('uses bare month when the whole range sits in one calendar year', () => {
    const start = at(2026, 2, 1);
    const end = at(2026, 11, 1); // ~9 months, same year
    const format = axisDateFormatter(LANG, start, end);
    const mid = at(2026, 6, 15);
    expect(format(mid)).toBe(fmt(mid, { month: 'short' }));
  });

  it('uses month + year once the range crosses calendar years', () => {
    const start = at(2024, 11, 1);
    const end = at(2026, 3, 1); // spans multiple years
    const format = axisDateFormatter(LANG, start, end);
    expect(format(start)).toBe(fmt(start, { year: 'numeric', month: 'short' }));
  });

  it('keeps day granularity for a short span that crosses a year boundary', () => {
    const start = at(2025, 12, 10);
    const end = at(2026, 1, 20); // ~41 days, different years
    const format = axisDateFormatter(LANG, start, end);
    expect(format(start)).toBe(fmt(start, { month: 'short', day: 'numeric' }));
  });
});
