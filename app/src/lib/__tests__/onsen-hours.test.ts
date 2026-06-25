import type { DaySchedule, WeeklySchedule } from '@kyuhachi/shared';
import { WEEKDAYS, groupSchedule, todayWeekday } from '@/lib/onsen-hours';

const NINE_TO_NINE: DaySchedule = { opens: '09:00', closes: '21:00' };
const TEN_TO_SIX: DaySchedule = { opens: '10:00', closes: '18:00' };

/** Build a WeeklySchedule from a Mon→Sun array of slots. */
function week(slots: (DaySchedule | null)[]): WeeklySchedule {
  return WEEKDAYS.reduce((acc, day, i) => {
    acc[day] = slots[i];
    return acc;
  }, {} as WeeklySchedule);
}

describe('groupSchedule', () => {
  it('collapses an all-identical week into a single Mon→Sun group', () => {
    const groups = groupSchedule(week(Array(7).fill(NINE_TO_NINE)));
    expect(groups).toHaveLength(1);
    expect(groups[0].days).toEqual(WEEKDAYS);
    expect(groups[0].slot).toEqual(NINE_TO_NINE);
  });

  it('merges a run of consecutive closed days', () => {
    // Mon–Fri open, Sat–Sun closed.
    const groups = groupSchedule(
      week([NINE_TO_NINE, NINE_TO_NINE, NINE_TO_NINE, NINE_TO_NINE, NINE_TO_NINE, null, null])
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].days).toEqual(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
    expect(groups[1].days).toEqual(['saturday', 'sunday']);
    expect(groups[1].slot).toBeNull();
  });

  it('does not merge alternating open/closed days', () => {
    const groups = groupSchedule(
      week([NINE_TO_NINE, null, NINE_TO_NINE, null, NINE_TO_NINE, null, NINE_TO_NINE])
    );
    expect(groups).toHaveLength(7);
    expect(groups.every((g) => g.days.length === 1)).toBe(true);
  });

  it('breaks a group when adjacent days have different windows', () => {
    // Mon–Tue 09:00–21:00, Wed 10:00–18:00, Thu–Sun 09:00–21:00.
    const groups = groupSchedule(
      week([NINE_TO_NINE, NINE_TO_NINE, TEN_TO_SIX, NINE_TO_NINE, NINE_TO_NINE, NINE_TO_NINE, NINE_TO_NINE])
    );
    expect(groups.map((g) => g.days)).toEqual([
      ['monday', 'tuesday'],
      ['wednesday'],
      ['thursday', 'friday', 'saturday', 'sunday'],
    ]);
  });

  it('keeps Sunday as a trailing singleton when it differs from Saturday', () => {
    const groups = groupSchedule(week([...Array(6).fill(NINE_TO_NINE), TEN_TO_SIX]));
    const last = groups[groups.length - 1];
    expect(last.days).toEqual(['sunday']);
    expect(last.slot).toEqual(TEN_TO_SIX);
  });
});

describe('todayWeekday', () => {
  it('maps a Monday to "monday"', () => {
    // 2026-06-22 is a Monday.
    expect(todayWeekday(new Date('2026-06-22T12:00:00'))).toBe('monday');
  });

  it('maps a Sunday to "sunday" (getDay() === 0 wraps to the end)', () => {
    // 2026-06-21 is a Sunday.
    expect(todayWeekday(new Date('2026-06-21T12:00:00'))).toBe('sunday');
  });
});
