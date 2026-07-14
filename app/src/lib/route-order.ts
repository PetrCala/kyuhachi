/**
 * Ordering rules for the routes list.
 *
 * A route may carry an explicit `sortOrder` (set when the user drag-reorders the
 * list). Routes without one (e.g. a route imported since the last reorder)
 * sort to the top, newest first, matching the import flow's "new route surfaces
 * at the top" behaviour. Kept here as pure functions so the comparator and the
 * write diff can be unit-tested without React or Firestore.
 */

export interface OrderableRoute {
  /** Manual position (ascending, 0 = top). Absent until the user reorders. */
  sortOrder?: number;
  /** createdAt in ms; `null` for a just-imported route whose server timestamp
   *  hasn't synced yet (treated as the newest). */
  createdAtMillis: number | null;
}

/**
 * List comparator. Explicitly-ordered routes come first, by `sortOrder`
 * ascending; unordered routes float above them, newest first. (An unordered
 * route is a fresh import the user hasn't placed yet, so the top is where they'd
 * expect to find it.)
 */
export function compareRoutes(a: OrderableRoute, b: OrderableRoute): number {
  const aHas = a.sortOrder != null;
  const bHas = b.sortOrder != null;
  if (aHas && bHas) {
    if (a.sortOrder !== b.sortOrder) return (a.sortOrder as number) - (b.sortOrder as number);
  } else if (aHas !== bHas) {
    // Unordered (fresh) sorts above ordered.
    return aHas ? 1 : -1;
  }
  // Both unordered, or a tie on sortOrder: newest first (null = newest).
  const am = a.createdAtMillis ?? Infinity;
  const bm = b.createdAtMillis ?? Infinity;
  return bm - am;
}

/**
 * Given the user's freshly dropped key order and each route's current
 * `sortOrder`, return only the `{ id, sortOrder }` rows that actually changed,
 * so a reorder writes the minimum number of Firestore docs (and a no-op drop
 * writes nothing).
 */
export function routeOrderUpdates(
  orderedIds: string[],
  currentSortOrderById: Map<string, number | undefined>
): { id: string; sortOrder: number }[] {
  const updates: { id: string; sortOrder: number }[] = [];
  orderedIds.forEach((id, index) => {
    if (currentSortOrderById.get(id) !== index) {
      updates.push({ id, sortOrder: index });
    }
  });
  return updates;
}
