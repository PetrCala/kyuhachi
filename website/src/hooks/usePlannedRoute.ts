import type { RouteDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { JOURNEY_UID } from '../config';
import { db } from '../firebase';

interface State {
  route: RouteDocument | null;
  failed: boolean;
}

/**
 * The route the default challenge currently points at (activeRouteId): the
 * "planned route" layer. Re-fetches when the app re-points the challenge at a
 * different route, since the challenge subscription is live.
 *
 * A null route is a normal state (no route imported yet) and a failed fetch is
 * not, but both leave this holding nothing, so the caller cannot tell them
 * apart without `failed`. It greys out two layer rows on an empty route, which
 * states as a fact that there is no planned route; on a failed read that is a
 * lie the visitor has no way to see through.
 */
export function usePlannedRoute(routeId: string | null): State {
  const [state, setState] = useState<State>({ route: null, failed: false });

  useEffect(() => {
    if (!routeId) {
      setState({ route: null, failed: false });
      return;
    }
    let cancelled = false;
    getDoc(doc(db, COLLECTIONS.USERS, JOURNEY_UID, SUBCOLLECTIONS.ROUTES, routeId))
      .then((snap) => {
        if (cancelled) return;
        setState({ route: snap.exists() ? (snap.data() as RouteDocument) : null, failed: false });
      })
      .catch((err) => {
        console.error('planned route fetch failed', err);
        // Keep the last good route rather than clearing it, matching the other
        // hooks: a stale line beats a map that claims there was never a plan.
        if (!cancelled) setState((prev) => ({ ...prev, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  return state;
}
