/**
 * The pool a visit is judged against: the challenge's frozen snapshot unioned
 * with the challenge type's live pool.
 *
 * Mirrors `effectiveEligibleIds` in `@kyuhachi/shared` (ADR-010 in the app
 * repo's docs/adr); the website sits outside the npm workspace, so this is a
 * copy kept in sync by hand, same arrangement as `JOURNEY_UID` in config.ts.
 * The union makes pool additions count for a running challenge while removals
 * never invalidate one: for a given challenge it only ever grows.
 */
export function effectiveEligibleIds(
  snapshotIds: readonly string[],
  liveIds: readonly string[] | null | undefined
): Set<string> {
  const union = new Set(snapshotIds);
  for (const id of liveIds ?? []) union.add(id);
  return union;
}
