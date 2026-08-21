import type { JourneyDayDocument } from '@kyuhachi/shared';
import { describe, expect, it } from 'vitest';
import {
  cumulativeMeters,
  dayAxis,
  jstEndOfDayMs,
  nextRecordedDay,
  prevRecordedDay,
  timelineDomain,
  trackPrefix,
} from '../timeline';

/** timelineDomain reads only `date`; the rest of the document is irrelevant. */
function day(date: string): JourneyDayDocument {
  return { date } as JourneyDayDocument;
}

describe('jstEndOfDayMs', () => {
  it('keeps an instant just before JST midnight inside the day', () => {
    // 2026-08-20T14:59:59Z is 23:59:59 in Tokyo, still the 20th.
    expect(Date.parse('2026-08-20T14:59:59Z')).toBeLessThanOrEqual(jstEndOfDayMs('2026-08-20'));
  });

  it('pushes an instant just after JST midnight into the next day', () => {
    // 2026-08-20T15:00:01Z is 00:00:01 on the 21st in Tokyo.
    const instant = Date.parse('2026-08-20T15:00:01Z');
    expect(instant).toBeGreaterThan(jstEndOfDayMs('2026-08-20'));
    expect(instant).toBeLessThanOrEqual(jstEndOfDayMs('2026-08-21'));
  });
});

describe('timelineDomain', () => {
  it('is null with nothing recorded', () => {
    expect(timelineDomain([])).toBeNull();
  });

  it('collapses a single day to itself', () => {
    expect(timelineDomain([day('2026-08-05')])).toEqual({
      first: '2026-08-05',
      last: '2026-08-05',
    });
  });

  it('does not trust the caller to have sorted', () => {
    expect(timelineDomain([day('2026-08-07'), day('2026-08-03'), day('2026-08-05')])).toEqual({
      first: '2026-08-03',
      last: '2026-08-07',
    });
  });
});

describe('dayAxis', () => {
  it('walks across a month boundary without skipping or inventing days', () => {
    expect(dayAxis('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });

  it('is a single entry when first and last coincide', () => {
    expect(dayAxis('2026-08-05', '2026-08-05')).toEqual(['2026-08-05']);
  });
});

describe('trackPrefix', () => {
  // Along the equator great-circle distance is exactly proportional to the
  // longitude difference, so the segment A to B is one unit and B to C is two:
  // the halfway cut by distance lands a quarter of the way into B to C.
  const points = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 0, lng: 3 },
  ];
  const cum = cumulativeMeters(points);

  it('accumulates from zero', () => {
    expect(cum[0]).toBe(0);
    expect(cum[2]).toBeCloseTo(cum[1] * 3, 3);
  });

  it('is just the start point at fraction 0', () => {
    expect(trackPrefix(points, cum, 0)).toEqual([{ lat: 0, lng: 0 }]);
    expect(trackPrefix(points, cum, -0.5)).toEqual([{ lat: 0, lng: 0 }]);
  });

  it('is the whole track at fraction 1 and beyond', () => {
    expect(trackPrefix(points, cum, 1)).toEqual(points);
    expect(trackPrefix(points, cum, 1.5)).toEqual(points);
  });

  it('interpolates the cut between unevenly spaced points', () => {
    const half = trackPrefix(points, cum, 0.5);
    expect(half).toHaveLength(3);
    expect(half[0]).toEqual({ lat: 0, lng: 0 });
    expect(half[1]).toEqual({ lat: 0, lng: 1 });
    expect(half[2].lat).toBeCloseTo(0, 6);
    expect(half[2].lng).toBeCloseTo(1.5, 6);
  });

  it('handles an empty track', () => {
    expect(trackPrefix([], [], 0.5)).toEqual([]);
  });
});

describe('prevRecordedDay and nextRecordedDay', () => {
  const recorded = ['2026-08-01', '2026-08-03', '2026-08-07'];

  it('steps over unrecorded calendar days', () => {
    expect(prevRecordedDay('2026-08-07', recorded)).toBe('2026-08-03');
    expect(nextRecordedDay('2026-08-03', recorded)).toBe('2026-08-07');
  });

  it('lands on neighbours from a day that was never recorded', () => {
    expect(prevRecordedDay('2026-08-05', recorded)).toBe('2026-08-03');
    expect(nextRecordedDay('2026-08-05', recorded)).toBe('2026-08-07');
  });

  it('is null past either end', () => {
    expect(prevRecordedDay('2026-08-01', recorded)).toBeNull();
    expect(nextRecordedDay('2026-08-07', recorded)).toBeNull();
  });
});
