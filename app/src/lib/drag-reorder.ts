/**
 * Pure drag-reorder math for `DraggableList`, so the slot/clamp and key-reorder
 * logic can be unit-tested without React, gesture-handler, or reanimated.
 *
 * These run on the JS thread: `positionsFromKeys` builds the initial/synced
 * layout, and the rest document and verify the math that `DraggableList`'s pan
 * worklet inlines (a worklet must be self-contained on the UI thread, so it
 * can't call across module boundaries — keeping the canonical version here keeps
 * it tested).
 *
 * `positions` is the canonical layout: a map of row key -> slot index
 * (0 = top), always a contiguous `0..n-1` range.
 */

/** Clamp a (possibly out-of-range) slot index into `[0, count - 1]`. */
export function clampSlot(slot: number, count: number): number {
  if (count <= 0) return 0;
  // `<= 0` (not `< 0`) so a `Math.round(-0.x)` of `-0` normalizes to `+0`.
  if (slot <= 0) return 0;
  const last = count - 1;
  if (slot > last) return last;
  return slot;
}

/**
 * The slot a row dragged to vertical offset `offsetY` (px from the top of the
 * list) should occupy. Rounds to the nearest slot and clamps to the list, so a
 * drag past either end settles into the first/last slot instead of running off.
 */
export function slotForOffset(offsetY: number, rowHeight: number, count: number): number {
  return clampSlot(Math.round(offsetY / rowHeight), count);
}

/** Build a `positions` map from keys already in display order (0 = top). */
export function positionsFromKeys(keys: string[]): Record<string, number> {
  const positions: Record<string, number> = {};
  for (let i = 0; i < keys.length; i++) positions[keys[i]] = i;
  return positions;
}

/** Keys in slot order (0 = top) — the array form of a `positions` map. */
export function keysInSlotOrder(positions: Record<string, number>): string[] {
  return Object.keys(positions).sort((a, b) => positions[a] - positions[b]);
}

/**
 * Move `key` to slot `target`, returning a fresh `positions` map with every row
 * reindexed to a contiguous `0..n-1` range. The other rows keep their relative
 * order, shifting up or down to make room. Returns the SAME object reference
 * when nothing would change (unknown key, or already at `target`), so callers
 * can cheaply skip a no-op write.
 */
export function reorderByMovingKey(
  positions: Record<string, number>,
  key: string,
  target: number
): Record<string, number> {
  const order = keysInSlotOrder(positions);
  const from = order.indexOf(key);
  if (from === -1 || from === target) return positions;
  order.splice(from, 1);
  order.splice(target, 0, key);
  return positionsFromKeys(order);
}
