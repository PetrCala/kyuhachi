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
