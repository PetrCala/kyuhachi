import { describe, expect, it } from '@jest/globals';
import { jstDay, previousJstDay } from '../recap';

/**
 * The day-boundary arithmetic, which is the part of the recap assembly that
 * has no database in it. Everything else in recap.ts is Firestore queries and
 * is covered by running it against the emulator, not here (see jest.config.js).
 */
describe('jstDay', () => {
  it('uses the JST calendar day, not UTC', () => {
    // 2026-10-13 23:00 UTC is already the 14th in Tokyo.
    expect(jstDay(Date.parse('2026-10-13T23:00:00Z'))).toBe('2026-10-14');
  });

  it('keeps a JST morning on its own day', () => {
    expect(jstDay(Date.parse('2026-10-13T01:00:00Z'))).toBe('2026-10-13');
  });

  it('puts JST midnight on the day that is starting', () => {
    // 15:00 UTC is exactly 00:00 JST the next day.
    expect(jstDay(Date.parse('2026-10-13T15:00:00Z'))).toBe('2026-10-14');
  });
});

describe('previousJstDay', () => {
  it('is the JST day before the one the instant falls on', () => {
    expect(previousJstDay(Date.parse('2026-10-14T00:30:00Z'))).toBe('2026-10-13');
  });
});
