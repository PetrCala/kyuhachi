import type { RouteDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { JOURNEY_UID } from '../config';
import { db } from '../firebase';

/**
 * The route the default challenge currently points at (activeRouteId): the
 * "planned route" layer. Re-fetches when the app re-points the challenge at a
 * different route, since the challenge subscription is live.
 */
export function usePlannedRoute(routeId: string | null): RouteDocument | null {
  const [route, setRoute] = useState<RouteDocument | null>(null);

  useEffect(() => {
    if (!routeId) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, COLLECTIONS.USERS, JOURNEY_UID, SUBCOLLECTIONS.ROUTES, routeId))
      .then((snap) => {
        if (cancelled) return;
        setRoute(snap.exists() ? (snap.data() as RouteDocument) : null);
      })
      .catch((err) => {
        console.error('planned route fetch failed', err);
        if (!cancelled) setRoute(null);
      });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  return route;
}
