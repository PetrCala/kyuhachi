/**
 * Passport (stamp-book) layout maths.
 *
 * The virtual passport mimics a physical 御湯印帳: a 4×3 grid per page that the
 * user fills one stamp at a time, in visit order. Stamps land in the Japanese
 * stamp-book convention — top→bottom down the rightmost column first, then the
 * next column to the left (right→left, columns before rows).
 *
 * Pure functions only, so the fill order is unit-testable without a renderer.
 */

export const GRID_ROWS = 4;
export const GRID_COLS = 3;
export const STAMPS_PER_PAGE = GRID_ROWS * GRID_COLS; // 12

/** A slot's position on its page, keyed to its global index across the book. */
export interface PassportCell {
  /** 0-based slot index across the whole passport (0 = first visit). */
  slot: number;
  /** Visual row, 0 = top. */
  row: number;
  /** Visual column, 0 = left. */
  col: number;
}

/** Number of pages needed to hold `totalSlots` stamps (at least one). */
export function pageCount(totalSlots: number): number {
  return Math.max(1, Math.ceil(totalSlots / STAMPS_PER_PAGE));
}

/**
 * The cells on `pageIndex`, positioned in fill order. Returns only cells whose
 * global slot index is < totalSlots, so the final page may hold fewer than 12.
 */
export function pageCells(pageIndex: number, totalSlots: number): PassportCell[] {
  const cells: PassportCell[] = [];
  for (let i = 0; i < STAMPS_PER_PAGE; i++) {
    const slot = pageIndex * STAMPS_PER_PAGE + i;
    if (slot >= totalSlots) break;
    cells.push({
      slot,
      row: i % GRID_ROWS,
      // Rightmost column (GRID_COLS - 1) fills first, then leftward.
      col: GRID_COLS - 1 - Math.floor(i / GRID_ROWS),
    });
  }
  return cells;
}

/** Japanese-style date for an inked stamp, e.g. 2026年3月17日. */
export function formatStampDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
