import {
  isRankAchieved,
  highestAchievedRank,
  nextRankToEarn,
  type RankProgress,
} from '@/lib/rank';
import type { Rank } from '@kyuhachi/shared';

// A trimmed slice of the official ladder — enough to exercise both axes and the
// monotonic-prefix behaviour. Ordered worst → best.
const RANKS: Rank[] = [
  { id: 'minarai', name: '見習い', minVisits: 8, minPrefectures: 0 },
  { id: 'nyumon', name: '入門', minVisits: 16, minPrefectures: 2 },
  { id: 'shokyu', name: '初級', minVisits: 24, minPrefectures: 3 },
  { id: 'senin', name: '泉人', minVisits: 88, minPrefectures: 7 },
];

function progress(eligibleVisits: number, distinctPrefectures: number): RankProgress {
  return { eligibleVisits, distinctPrefectures };
}

describe('isRankAchieved', () => {
  it('requires both thresholds', () => {
    const nyumon = RANKS[1]; // 16 visits, 2 prefectures
    expect(isRankAchieved(nyumon, progress(16, 2))).toBe(true);
    expect(isRankAchieved(nyumon, progress(15, 2))).toBe(false); // visits short
    expect(isRankAchieved(nyumon, progress(16, 1))).toBe(false); // prefectures short
  });

  it('treats a zero prefecture minimum as always satisfied', () => {
    const minarai = RANKS[0]; // 8 visits, 0 prefectures
    expect(isRankAchieved(minarai, progress(8, 0))).toBe(true);
  });
});

describe('highestAchievedRank', () => {
  it('returns null before the first rank is met', () => {
    expect(highestAchievedRank(RANKS, progress(7, 0))).toBeNull();
  });

  it('returns the highest rung met on both axes', () => {
    expect(highestAchievedRank(RANKS, progress(30, 3))?.id).toBe('shokyu');
  });

  it('is gated by prefecture diversity, not just visit count', () => {
    // 50 visits but only one prefecture: stuck at 見習い (next needs 2 prefectures).
    expect(highestAchievedRank(RANKS, progress(50, 1))?.id).toBe('minarai');
  });

  it('returns null on an empty ladder', () => {
    expect(highestAchievedRank([], progress(99, 7))).toBeNull();
  });
});

describe('nextRankToEarn', () => {
  it('is the lowest rank when none are achieved', () => {
    expect(nextRankToEarn(RANKS, progress(0, 0))?.id).toBe('minarai');
  });

  it('is the rank just above the one held', () => {
    expect(nextRankToEarn(RANKS, progress(30, 3))?.id).toBe('senin');
  });

  it('is null at the apex', () => {
    expect(nextRankToEarn(RANKS, progress(88, 7))).toBeNull();
  });
});
