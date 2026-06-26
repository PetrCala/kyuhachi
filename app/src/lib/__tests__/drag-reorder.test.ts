import {
  clampSlot,
  keysInSlotOrder,
  positionsFromKeys,
  reorderByMovingKey,
  slotForOffset,
} from '../drag-reorder';

describe('clampSlot', () => {
  it('passes through in-range slots', () => {
    expect(clampSlot(0, 3)).toBe(0);
    expect(clampSlot(1, 3)).toBe(1);
    expect(clampSlot(2, 3)).toBe(2);
  });

  it('clamps a slot below the top to 0', () => {
    expect(clampSlot(-1, 3)).toBe(0);
    expect(clampSlot(-99, 3)).toBe(0);
  });

  it('clamps a slot past the last row to count - 1', () => {
    expect(clampSlot(3, 3)).toBe(2);
    expect(clampSlot(99, 3)).toBe(2);
  });

  it('returns 0 for an empty list', () => {
    expect(clampSlot(0, 0)).toBe(0);
    expect(clampSlot(5, 0)).toBe(0);
  });
});

describe('slotForOffset', () => {
  const rowHeight = 100;
  const count = 4; // slots 0..3

  it('rounds an offset to the nearest slot', () => {
    expect(slotForOffset(0, rowHeight, count)).toBe(0);
    expect(slotForOffset(40, rowHeight, count)).toBe(0); // under half a row
    expect(slotForOffset(60, rowHeight, count)).toBe(1); // over half a row
    expect(slotForOffset(150, rowHeight, count)).toBe(2);
  });

  it('clamps a drag above the top to the first slot', () => {
    expect(slotForOffset(-30, rowHeight, count)).toBe(0);
    expect(slotForOffset(-1000, rowHeight, count)).toBe(0);
  });

  it('clamps a drag past the bottom to the last slot', () => {
    expect(slotForOffset(400, rowHeight, count)).toBe(3);
    expect(slotForOffset(99999, rowHeight, count)).toBe(3);
  });
});

describe('positionsFromKeys / keysInSlotOrder', () => {
  it('round-trips keys to a contiguous slot map and back', () => {
    const keys = ['a', 'b', 'c'];
    const positions = positionsFromKeys(keys);
    expect(positions).toEqual({ a: 0, b: 1, c: 2 });
    expect(keysInSlotOrder(positions)).toEqual(keys);
  });
});

describe('reorderByMovingKey', () => {
  const positions = { a: 0, b: 1, c: 2, d: 3 };

  it('moves a key down and reindexes the rest', () => {
    expect(reorderByMovingKey(positions, 'a', 2)).toEqual({ b: 0, c: 1, a: 2, d: 3 });
  });

  it('moves a key up and reindexes the rest', () => {
    expect(reorderByMovingKey(positions, 'd', 0)).toEqual({ d: 0, a: 1, b: 2, c: 3 });
  });

  it('swaps two adjacent rows', () => {
    expect(reorderByMovingKey(positions, 'b', 2)).toEqual({ a: 0, c: 1, b: 2, d: 3 });
  });

  it('returns the same reference (no write) when the slot is unchanged', () => {
    expect(reorderByMovingKey(positions, 'b', 1)).toBe(positions);
  });

  it('returns the same reference for an unknown key', () => {
    expect(reorderByMovingKey(positions, 'z', 0)).toBe(positions);
  });
});
