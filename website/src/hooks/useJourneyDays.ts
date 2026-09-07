import type { JourneyDayDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { decodePolyline } from '../lib/polyline';
import type { WalkedDay } from '../types';

interface State {
  days: WalkedDay[] | null;
  failed: boolean;
}

/**
 * The encoding is a wire format and stops here: everything downstream of this
 * hook sees a plain list of points.
 *
 * Every document carries `polyline`. The publish path has written nothing else
 * since the track stopped being an array, and the two days that predated it
 * were re-encoded by scripts/migrate-journey-day-polylines.ts. A document
 * without one is therefore not a shape to fall back on but a broken write, and
 * decoding throws, which the caller turns into the "part of the journey could
 * not be loaded" banner rather than a map quietly missing a day.
 */
function toWalkedDay(stored: JourneyDayDocument): WalkedDay {
  const { polyline, ...rest } = stored;
  return { ...rest, points: decodePolyline(polyline) };
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
          days: snap.docs.map((docSnap) => toWalkedDay(docSnap.data() as JourneyDayDocument)),
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
