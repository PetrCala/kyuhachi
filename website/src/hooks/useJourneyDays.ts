import type { JourneyDayDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import type { LatLng } from '../lib/geo';
import { decodePolyline } from '../lib/polyline';
import type { WalkedDay } from '../types';

interface State {
  days: WalkedDay[] | null;
  failed: boolean;
}

/**
 * A document as it may actually be stored. Every day published since the track
 * became an encoded polyline carries `polyline`; days written before that still
 * carry a raw `points` array until the migration script has been over them
 * (scripts/migrate-journey-day-polylines.ts). Reading both means the site never
 * depends on the website deploy and the migration landing in a given order.
 * Drop the `points` half once no document has it.
 */
type StoredJourneyDay = Omit<JourneyDayDocument, 'polyline'> & {
  polyline?: string;
  points?: LatLng[];
};

/** The stored track, however this particular document happens to hold it. */
function toWalkedDay(stored: StoredJourneyDay): WalkedDay {
  const { polyline, points, ...rest } = stored;
  return { ...rest, points: polyline != null ? decodePolyline(polyline) : (points ?? []) };
}

/**
 * Every walked day, oldest first. Fetched once per page load: the sync writes
 * once a morning, so there is nothing to watch live.
 *
 * `failed` matters here more than anywhere: an empty day list reads as "he has
 * not walked yet", which is a lie the page tells convincingly.
 */
export function useJourneyDays(): State {
  const [state, setState] = useState<State>({ days: null, failed: false });

  useEffect(() => {
    let cancelled = false;
    getDocs(query(collection(db, COLLECTIONS.JOURNEY_DAYS), orderBy('date')))
      .then((snap) => {
        if (cancelled) return;
        setState({
          days: snap.docs.map((docSnap) => toWalkedDay(docSnap.data() as StoredJourneyDay)),
          failed: false,
        });
      })
      .catch((err) => {
        console.error('journey days fetch failed', err);
        // Keep the last good days instead of falling back to [], which would
        // erase the walked route and quietly hide the distance chip.
        if (!cancelled) setState((prev) => ({ days: prev.days, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
