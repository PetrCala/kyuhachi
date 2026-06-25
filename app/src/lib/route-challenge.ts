/**
 * The challenge attach/detach action shown in a route's ⋯ menu, derived purely
 * from current state so it can be unit-tested without React or Firestore.
 *
 * Returns null when there is no active challenge to attach to — the menu omits
 * the action entirely in that case.
 */
export interface ChallengeRouteAction {
  /** i18n key for the menu label. */
  labelKey: 'routes.useInChallenge' | 'routes.removeFromChallenge';
  /** The value to write to the active challenge's `activeRouteId`. */
  nextActiveRouteId: string | null;
}

export function challengeRouteAction(
  routeId: string,
  challengeId: string | null,
  activeRouteId: string | null
): ChallengeRouteAction | null {
  if (!challengeId) return null;
  // Already the attached route → offer to detach; otherwise offer to attach.
  return routeId === activeRouteId
    ? { labelKey: 'routes.removeFromChallenge', nextActiveRouteId: null }
    : { labelKey: 'routes.useInChallenge', nextActiveRouteId: routeId };
}
