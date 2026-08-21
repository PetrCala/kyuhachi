/**
 * Date formatting for a walk that happens in Japan, read by friends who are not.
 *
 * Two different inputs need two different treatments, and mixing them up is the
 * bug this module exists to prevent:
 *
 * - A JST calendar day already decided upstream ("2026-08-21" on a journey day).
 *   There is nothing to convert; the day is the answer. Turning it into a Date
 *   at JST midnight and formatting that in the viewer's zone rolls it back a day
 *   for anyone west of Japan, so a European friend reads "20 Aug 2026" for a walk
 *   that happened on the 21st. Hence the fixed UTC frame below: it carries the
 *   three numbers through Intl untouched, whatever zone the browser is in.
 * - A real instant (a Firestore timestamp), where the JST day genuinely has to
 *   be computed from the moment. That one asks Intl for Asia/Tokyo.
 *
 * Both print "21 Aug 2026", the style the site already uses.
 */

const STYLE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

/** Formats a "YYYY-MM-DD" JST calendar day. The viewer's zone cannot shift it. */
export function formatJstDay(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number);
  // Date.UTC + timeZone 'UTC' is a neutral carrier for the parts, not a
  // conversion: never swap it for a local-time Date, that is the old bug.
  const parts = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-GB', { ...STYLE, timeZone: 'UTC' }).format(parts);
}

/** Formats a real instant as the JST calendar day it fell on. */
export function formatJstTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { ...STYLE, timeZone: 'Asia/Tokyo' }).format(date);
}
