/**
 * Display formatters for the Stats screens. They return localized strings (so
 * they take `t`), keeping all user-facing text in the i18n catalog while the
 * `lib/stats` compute modules stay pure and string-free.
 */
import type { TFunction } from 'i18next';

/** Round to one decimal place, trimming a trailing `.0` (e.g. 3 → "3", 3.04 → "3"). */
export function round1(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Whole-number percent string, e.g. 66.7 → "67%". */
export function formatPercent(value: number, t: TFunction): string {
  return t('stats.unit.percent', { value: Math.round(value) });
}

/** Total minutes → "Xh Ym" / "Xh" / "Ym" via the stats.unit.* keys. */
export function formatDuration(totalMinutes: number, t: TFunction): string {
  const rounded = Math.round(totalMinutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h > 0 && m > 0) return t('stats.unit.hoursMinutes', { h, m });
  if (h > 0) return t('stats.unit.hours', { h });
  return t('stats.unit.minutes', { m });
}

/** Localized absolute date for a millis instant, e.g. "Jun 24, 2026". */
export function formatDate(ms: number, language: string): string {
  return new Date(ms).toLocaleDateString(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Localized month + year for a millis instant, e.g. "Mar 2027": compact for tiles. */
export function formatMonthYear(ms: number, language: string): string {
  return new Date(ms).toLocaleDateString(language, { year: 'numeric', month: 'short' });
}

const DAY_MS = 86_400_000;

/**
 * A localized date formatter for a time axis, whose granularity adapts to the
 * spanned range so ticks stay readable and distinct: day-level for short spans
 * (≤ ~3 months, e.g. "Jun 24"), bare month when the whole range sits in one
 * calendar year (e.g. "Jun"), and month + year once it crosses years
 * (e.g. "Jun 2026"). Built once from the range, then applied per tick.
 */
export function axisDateFormatter(
  language: string,
  startMs: number,
  endMs: number
): (ms: number) => string {
  const days = (endMs - startMs) / DAY_MS;
  const sameYear = new Date(startMs).getFullYear() === new Date(endMs).getFullYear();
  let options: Intl.DateTimeFormatOptions;
  if (days <= 92) options = { month: 'short', day: 'numeric' };
  else if (sameYear) options = { month: 'short' };
  else options = { year: 'numeric', month: 'short' };
  return (ms) => new Date(ms).toLocaleDateString(language, options);
}
