import {
  pageCount,
  pageCells,
  formatStampDate,
  STAMPS_PER_PAGE,
  GRID_COLS,
} from '@/lib/passport';

describe('pageCount', () => {
  it('needs one page for an empty or single page of slots', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(12)).toBe(1);
  });

  it('rounds up partial pages', () => {
    expect(pageCount(13)).toBe(2);
    expect(pageCount(88)).toBe(8); // 7 full pages + a partial 8th
  });
});

describe('pageCells', () => {
  it('fills the rightmost column top→bottom first, then leftward', () => {
    const cells = pageCells(0, 88);
    expect(cells).toHaveLength(STAMPS_PER_PAGE);
    // First visit lands top-right.
    expect(cells[0]).toEqual({ slot: 0, row: 0, col: GRID_COLS - 1 });
    // The right column (slots 0–3) fills before the middle column starts.
    expect(cells[3]).toEqual({ slot: 3, row: 3, col: GRID_COLS - 1 });
    expect(cells[4]).toEqual({ slot: 4, row: 0, col: GRID_COLS - 2 });
    // Last cell of a full page is bottom-left.
    expect(cells[11]).toEqual({ slot: 11, row: 3, col: 0 });
  });

  it('returns a partial final page without padding', () => {
    // 88 slots → page 7 holds slots 84–87 only, all in the rightmost column.
    const cells = pageCells(7, 88);
    expect(cells).toHaveLength(4);
    expect(cells.map((c) => c.slot)).toEqual([84, 85, 86, 87]);
    expect(cells.every((c) => c.col === GRID_COLS - 1)).toBe(true);
    expect(cells.map((c) => c.row)).toEqual([0, 1, 2, 3]);
  });
});

describe('formatStampDate', () => {
  it('formats as 年月日 with no leading zeros', () => {
    expect(formatStampDate(new Date(2026, 2, 17))).toBe('2026年3月17日');
    expect(formatStampDate(new Date(2026, 11, 5))).toBe('2026年12月5日');
  });
});
