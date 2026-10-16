import { useEffect, useState } from 'react';
import { collection, getDocs } from '@react-native-firebase/firestore';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { COLLECTIONS, type KonbiniDocument } from '@kyuhachi/shared';
import { db } from '@/firebase';

/**
 * Every /konbini document, fetched once per mount. The collection is small (the
 * stores within a couple of kilometres of one route) and changes only when the
 * batch job is re-run, so a single read is enough; Firestore's offline
 * persistence serves it from cache when there is no network. A failed read
 * leaves the list empty, which just means no badges: the finder itself does
 * not depend on this data.
 */
export function useKonbiniEatIn(): KonbiniDocument[] {
  const [konbini, setKonbini] = useState<KonbiniDocument[]>([]);

  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, COLLECTIONS.KONBINI))
      .then((snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
        if (cancelled) return;
        setKonbini(snapshot.docs.map((d) => d.data() as KonbiniDocument));
      })
      .catch(() => {
        // Offline with an empty cache, or rules denied: no badges this session.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return konbini;
}
