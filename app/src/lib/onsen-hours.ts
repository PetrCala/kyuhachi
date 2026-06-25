import type { DaySchedule, WeeklySchedule } from '@kyuhachi/shared';

/** Weekday keys in display order (Monday-first), matching the gojūon-agnostic
 *  Mon→Sun reading of an onsen's weekly schedule. */
export const WEEKDAYS: (keyof WeeklySchedule)[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/** A run of consecutive days that share the same open window (or are all closed). */
export interface ScheduleGroup {
  days: (keyof WeeklySchedule)[];
  slot: DaySchedule | null;
}

/** Collapse consecutive days (Mon→Sun) sharing the same window / closed state into
 *  ranges, so an unbroken "09:00–21:00" week renders as one row instead of seven. */
export function groupSchedule(schedule: WeeklySchedule): ScheduleGroup[] {
  const groups: ScheduleGroup[] = [];
  for (const day of WEEKDAYS) {
    const slot = schedule[day];
    const last = groups[groups.length - 1];
    const same =
      !!last &&
      ((last.slot === null && slot === null) ||
        (!!last.slot &&
          !!slot &&
          last.slot.opens === slot.opens &&
          last.slot.closes === slot.closes));
    if (same) last.days.push(day);
    else groups.push({ days: [day], slot });
  }
  return groups;
}

/** The Monday-indexed weekday key for `now` (defaults to the current time). JS
 *  `Date.getDay()` is Sunday-indexed (0=Sun); `(getDay() + 6) % 7` rotates it so
 *  Monday maps to WEEKDAYS[0]. `now` is injectable for deterministic tests. */
export function todayWeekday(now: Date = new Date()): keyof WeeklySchedule {
  return WEEKDAYS[(now.getDay() + 6) % 7];
}
