import type { JourneyDayDocument } from '@kyuhachi/shared';
import { haversineKm } from './geo';
import type { LatLng } from './geo';

/**
 * Pure calendar and geometry helpers behind the time-machine scrubber. No
 * React, no MapLibre: the hook and the map both call in here, and the tests
 * exercise this file alone.
 *
 * Everything works in JST calendar days ("YYYY-MM-DD"), the same frame the
 * journey_days documents are keyed in, so a "day" here always means the day
 * Petr walked it, not the day a viewer's browser thinks it was.
 */

export type { LatLng };

/**
 * The last instant of a JST calendar day, as epoch milliseconds. A visit
 * timestamp at or below this belongs to the day; one above it happened the
 * next JST morning, however early it looks in the viewer's own zone.
 */
export function jstEndOfDayMs(day: string): number {
  return Date.parse(day + 'T23:59:59.999+09:00');
}

/** The first and last recorded days, or null when nothing is recorded yet. */
export function timelineDomain(
  days: JourneyDayDocument[]
): { first: string; last: string } | null {
  if (days.length === 0) return null;
  // The query orders by date, but a min/max scan costs nothing and means this
  // module never has to trust its caller's sort.
  let first = days[0].date;
  let last = days[0].date;
  for (const day of days) {
    if (day.date < first) first = day.date;
    if (day.date > last) last = day.date;
  }
  return { first, last };
}

/**
 * Every JST calendar day from `first` to `last` inclusive, rest days and all:
 * the scrubber's axis is the calendar, not the list of recorded days, so a
 * week off shows up as a stretch where dragging changes nothing on the map.
 */
export function dayAxis(first: string, last: string): string[] {
  const days: string[] = [];
  // UTC is a neutral carrier for stepping "YYYY-MM-DD" strings one day at a
  // time (the format-date.ts trick): no zone, no DST, so day + 24h is always
  // exactly the next calendar day.
  const end = Date.parse(last + 'T00:00:00Z');
  for (let t = Date.parse(first + 'T00:00:00Z'); t <= end; t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Distance walked up to each point, meters, so cum[0] is 0 and the last entry
 * is the track's total. Computed once per track and handed to `trackPrefix`,
 * which is what runs every animation frame.
 */
export function cumulativeMeters(points: LatLng[]): number[] {
  const cum: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) total += haversineKm(points[i - 1], points[i]) * 1000;
    cum.push(total);
  }
  return cum;
}

/**
 * The points covering the first `fraction` of the track's distance, ending in
 * one interpolated point exactly at the cut, so the animated head advances
 * smoothly instead of jumping vertex to vertex. Fractions at or below 0 give
 * just the start; at or above 1, the whole track.
 */
export function trackPrefix(points: LatLng[], cum: number[], fraction: number): LatLng[] {
  if (points.length === 0) return [];
  if (fraction <= 0) return [points[0]];
  const total = cum[cum.length - 1];
  // A zero-length track has no meaningful cut; any positive fraction of it is
  // all of it.
  if (fraction >= 1 || total <= 0) return points.slice();

  const target = fraction * total;
  // Binary search for the last point not past the target: playback calls this
  // every frame, and a linear scan over a long day would make the whole walk
  // animation O(points squared).
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= target) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const prefix = points.slice(0, lo + 1);
  if (cum[lo] < target && lo + 1 < points.length) {
    const t = (target - cum[lo]) / (cum[lo + 1] - cum[lo]);
    const a = points[lo];
    const b = points[lo + 1];
    // Linear interpolation in raw lat/lng: consecutive track points are metres
    // apart, where the flat-earth error is far below a pixel.
    prefix.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
  }
  return prefix;
}

/**
 * The latest recorded day strictly before `day`, or null at the start. `day`
 * itself need not be recorded: stepping back from a rest day lands on the last
 * day actually walked.
 */
export function prevRecordedDay(day: string, recorded: string[]): string | null {
  let best: string | null = null;
  for (const d of recorded) {
    if (d < day && (best == null || d > best)) best = d;
  }
  return best;
}

/** The earliest recorded day strictly after `day`, or null at the end. */
export function nextRecordedDay(day: string, recorded: string[]): string | null {
  let best: string | null = null;
  for (const d of recorded) {
    if (d > day && (best == null || d < best)) best = d;
  }
  return best;
}
