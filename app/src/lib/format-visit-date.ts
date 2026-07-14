/**
 * Short, social-feed-style timestamp for a visit: today / yesterday / "Nd ago"
 * within the last week, then a locale-formatted calendar date. Calendar-based
 * (not 24h-based), so "yesterday" means the previous date regardless of clock
 * time. No date library: the repo intentionally has none.
 */
import type { TFunction } from 'i18next';

const DAY_MS = 86_400_000;

export function formatVisitDate(date: Date, now: Date, t: TFunction, locale: string): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.round((startOfToday - startOfDate) / DAY_MS);

  if (daysAgo <= 0) return t('visits.today');
  if (daysAgo === 1) return t('visits.yesterday');
  if (daysAgo < 7) return t('visits.daysAgo', { count: daysAgo });
  return date.toLocaleDateString(locale);
}
