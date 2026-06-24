import { computeProgress } from '../progress';
import { days } from '../__fixtures__/factories';

const DAY = 86_400_000;

describe('computeProgress', () => {
  it('returns a clean zero state for an untouched challenge', () => {
    const r = computeProgress({
      completionCount: 88,
      eligibleVisitCount: 0,
      startDateMs: 0,
      completedAtMs: null,
      eligibleVisitMs: [],
      now: days(10),
    });
    expect(r.visitsDone).toBe(0);
    expect(r.remaining).toBe(88);
    expect(r.percentComplete).toBe(0);
    expect(r.daysElapsed).toBe(10);
    expect(r.visitsPerMonth).toBeNull();
    expect(r.avgDaysBetweenVisits).toBeNull();
    expect(r.projectedCompletionMs).toBeNull();
    expect(r.isComplete).toBe(false);
  });

  it('derives pace and a projected completion from start → now', () => {
    const r = computeProgress({
      completionCount: 88,
      eligibleVisitCount: 10,
      startDateMs: 0,
      completedAtMs: null,
      eligibleVisitMs: [days(0), days(100)],
      now: days(100),
    });
    // 10 visits / 100 days = 0.1/day → 3.04375/month
    expect(r.visitsPerMonth).toBeCloseTo(3.04375, 4);
    // 78 remaining / 0.1 per day = 780 more days from now.
    expect(r.projectedCompletionMs).toBe(days(880));
  });

  it('averages the gap between consecutive visits', () => {
    const r = computeProgress({
      completionCount: 88,
      eligibleVisitCount: 3,
      startDateMs: 0,
      completedAtMs: null,
      eligibleVisitMs: [days(0), days(10), days(40)],
      now: days(40),
    });
    expect(r.avgDaysBetweenVisits).toBe(20); // (40 − 0) / 2
  });

  it('has no pace on day zero and no avg gap with a single visit', () => {
    const r = computeProgress({
      completionCount: 88,
      eligibleVisitCount: 1,
      startDateMs: 0,
      completedAtMs: null,
      eligibleVisitMs: [0],
      now: 0,
    });
    expect(r.visitsPerMonth).toBeNull();
    expect(r.avgDaysBetweenVisits).toBeNull();
  });

  it('marks completion and measures its duration, with no projection left', () => {
    const r = computeProgress({
      completionCount: 88,
      eligibleVisitCount: 88,
      startDateMs: 0,
      completedAtMs: days(200) + DAY / 2,
      eligibleVisitMs: [days(0), days(200)],
      now: days(210),
    });
    expect(r.isComplete).toBe(true);
    expect(r.remaining).toBe(0);
    expect(r.percentComplete).toBe(100);
    expect(r.projectedCompletionMs).toBeNull();
    expect(r.completionDurationDays).toBe(200);
  });
});
