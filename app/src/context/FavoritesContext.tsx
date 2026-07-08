import { createContext, useContext, useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';

interface FavoritesContextValue {
  /** kyuhachiIds of the user's favorited onsens. */
  favoriteIds: Set<string>;
  /** True until the favorites subscription has reported at least once. */
  loading: boolean;
  isFavorite: (onsenId: string) => boolean;
  toggleFavorite: (onsenId: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue>({
  favoriteIds: new Set(),
  loading: true,
  isFavorite: () => false,
  toggleFavorite: () => {},
});

/**
 * Live view of /users/{uid}/favorites. The doc id is the onsen's kyuhachiId,
 * so toggling is a set/delete on a known path — no queries, structurally
 * deduplicated. Writes are fire-and-forget: Firestore's latency compensation
 * flips the local snapshot (and the heart) instantly, and the offline queue
 * delivers the write when the network returns.
 */
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setFavoriteIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);

    const unsubscribe = onSnapshot(
      collection(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.FAVORITES),
      (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
        setFavoriteIds(new Set(snapshot.docs.map((d) => d.id)));
        setLoading(false);
      },
      () => {
        setFavoriteIds(new Set());
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  const isFavorite = (onsenId: string) => favoriteIds.has(onsenId);

  const toggleFavorite = (onsenId: string) => {
    if (!user) return;
    const ref = doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.FAVORITES, onsenId);
    if (favoriteIds.has(onsenId)) {
      deleteDoc(ref).catch(() => {});
    } else {
      setDoc(ref, { createdAt: serverTimestamp() }).catch(() => {});
    }
  };

  return (
    <FavoritesContext.Provider value={{ favoriteIds, loading, isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  return useContext(FavoritesContext);
}
