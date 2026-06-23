import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { OnsenDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { OnsenList, type OnsenListItem } from '@/components/OnsenList';
import { db } from '@/firebase';

type OnsenDoc = OnsenDocument & { id: string };

export default function OnsenBrowse() {
  // Visited state for the active challenge comes from the shared hook so this
  // tab, the home dashboard, and the record-a-visit list stay in sync.
  const { visitedIds } = useActiveChallengeProgress();
  const [onsens, setOnsens] = useState<OnsenDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(
        collection(db, COLLECTIONS.ONSENS),
        where('isActive', '==', true),
        orderBy('areaName'),
        orderBy('name')
      ),
      (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
        setOnsens(
          snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as OnsenDocument) }))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, []);

  const items = useMemo<OnsenListItem[]>(
    () =>
      onsens.map((o) => ({
        id: o.id,
        name: o.name,
        areaName: o.areaName,
        prefecture: o.prefecture,
        lat: o.lat,
        lng: o.lng,
        visited: visitedIds.has(o.id),
      })),
    [onsens, visitedIds]
  );

  return <OnsenList data={items} loading={loading} unvisitedVariant="chevron" />;
}
