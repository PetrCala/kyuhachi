import { useState, useEffect, useMemo, useCallback } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  Timestamp,
  documentId,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type {
  UserDocument,
  ChallengeDocument,
  ChallengeTypeDocument,
  OnsenDocument,
  RouteDocument,
  Tier,
  VisitDocument,
} from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import { localizeTier } from '@/lib/challenge-i18n';

export interface OnsenRow {
  id: string;
  name: string;
  areaName: string;
  prefecture: string;
  lat: number;
  lng: number;
  visited: boolean;
}

/** Display fields for an eligible onsen, keyed by onsenId in `onsenMap`. */
export interface OnsenDisplayInfo {
  name: string;
  areaName: string;
  prefecture: string;
  lat: number;
  lng: number;
  /** Adult walk-in fee in yen; null when no parseable fee. Powers the Stats budget. */
  adultFee: number | null;
}

export interface ActiveChallengeProgress {
  loading: boolean;
  /** null while the user doc is still resolving, then whether a default challenge exists. */
  hasChallenge: boolean | null;
  challengeId: string | null;
  challenge: ChallengeDocument | null;
  tiers: Tier[];
  completionCount: number | null;
  eligibleVisitCount: number;
  activeRoute: RouteDocument | null;
  /** kyuhachiIds of every onsen visited in the active challenge (not just eligible ones). */
  visitedIds: Set<string>;
  /** Every visit in the active challenge, keyed by onsenId. */
  visits: Map<string, VisitDocument>;
  /** Display info for the active challenge's eligible onsens, keyed by onsenId. */
  onsenMap: Map<string, OnsenDisplayInfo>;
  /** Eligible onsens for the active challenge; display order is handled by OnsenList. */
  rows: OnsenRow[];
  clearRoute: () => Promise<void>;
  selectRoute: () => void;
}

/**
 * The shared data layer for the home dashboard and the record-a-visit list.
 * Subscribes to the active challenge (user → challenge → visits), its challenge
 * type (tiers / completion target), the eligible onsens' display data, and the
 * active route. A challenge's tier (earnedTier) is maintained server-side by the
 * visit Functions and read straight off the challenge doc where it's shown.
 */
export function useActiveChallengeProgress(): ActiveChallengeProgress {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [hasChallenge, setHasChallenge] = useState<boolean | null>(null);
  const [challenge, setChallenge] = useState<ChallengeDocument | null>(null);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [visits, setVisits] = useState<Map<string, VisitDocument>>(new Map());
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [completionCount, setCompletionCount] = useState<number | null>(null);
  const [onsenMap, setOnsenMap] = useState<Map<string, OnsenDisplayInfo>>(new Map());
  const [activeRoute, setActiveRoute] = useState<RouteDocument | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen to user → challenge → visits chain
  useEffect(() => {
    if (!user) return;

    let unsubChallenge: (() => void) | null = null;
    let unsubVisits: (() => void) | null = null;

    function cleanupInner() {
      unsubVisits?.();
      unsubVisits = null;
      unsubChallenge?.();
      unsubChallenge = null;
    }

    const unsubUser = onSnapshot(
      doc(db, COLLECTIONS.USERS, user.uid),
      (userDoc: FirebaseFirestoreTypes.DocumentSnapshot) => {
        const data = userDoc.data() as UserDocument | undefined;
        const defChallengeId = data?.defaultChallengeId ?? null;
        setChallengeId(defChallengeId);

        cleanupInner();

        if (!defChallengeId) {
          setHasChallenge(false);
          setChallenge(null);
          setLoading(false);
          return;
        }

        setHasChallenge(true);

        unsubChallenge = onSnapshot(
          doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.CHALLENGES, defChallengeId),
          (challengeDoc: FirebaseFirestoreTypes.DocumentSnapshot) => {
            if (!challengeDoc.exists()) {
              setChallenge(null);
              setLoading(false);
              return;
            }

            const challengeData = challengeDoc.data() as ChallengeDocument;
            setChallenge(challengeData);

            unsubVisits?.();
            unsubVisits = onSnapshot(
              collection(
                db,
                COLLECTIONS.USERS,
                user.uid,
                SUBCOLLECTIONS.CHALLENGES,
                defChallengeId,
                SUBCOLLECTIONS.VISITS
              ),
              (visitsSnap: FirebaseFirestoreTypes.QuerySnapshot) => {
                setVisitedIds(new Set(visitsSnap.docs.map((d) => d.id)));
                // RNFirebase has no `serverTimestamps: 'estimate'` read option, so a
                // just-recorded visit's optimistic (pending-write) snapshot reports its
                // serverTimestamp() fields as null until the server write lands. Fill
                // those nulls with a local now() estimate so consumers never touch null
                // (the feed sort calls `.toMillis()`, VisitCard calls `.toDate()`). The
                // real server values replace the estimate on the next snapshot.
                const estimate = Timestamp.now();
                const visitMap = new Map<string, VisitDocument>();
                for (const d of visitsSnap.docs) {
                  const visit = d.data() as VisitDocument;
                  visitMap.set(d.id, {
                    ...visit,
                    visitedAt: visit.visitedAt ?? estimate,
                    createdAt: visit.createdAt ?? estimate,
                    updatedAt: visit.updatedAt ?? estimate,
                  });
                }
                setVisits(visitMap);
                setLoading(false);
              }
            );
          }
        );
      },
      (error) => {
        console.error('Failed to subscribe to user profile', error);
        cleanupInner();
        setHasChallenge(null);
        setChallenge(null);
        setLoading(false);
      }
    );

    return () => {
      cleanupInner();
      unsubUser();
    };
  }, [user]);

  // Listen to challenge type for tiers
  useEffect(() => {
    if (!challenge) {
      setTiers([]);
      setCompletionCount(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, COLLECTIONS.CHALLENGE_TYPES, challenge.typeId),
      (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
        if (!snapshot.exists()) {
          setTiers([]);
          setCompletionCount(null);
          return;
        }
        const data = snapshot.data() as ChallengeTypeDocument;
        setTiers((data.tiers ?? []).map((tier) => localizeTier(challenge.typeId, tier, t)));
        setCompletionCount(data.completionCount);
      }
    );
    return unsub;
  }, [challenge?.typeId, t]);

  // Fetch onsen display data for eligible IDs
  useEffect(() => {
    if (!challenge) return;

    const ids = challenge.snapshotEligibleOnsenIds;
    if (ids.length === 0) return;

    // Firestore 'in' queries support max 30 values, so batch
    const BATCH_SIZE = 30;
    const unsubscribes: (() => void)[] = [];
    const collected = new Map<string, OnsenDisplayInfo>();

    let pending = Math.ceil(ids.length / BATCH_SIZE);

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      const unsub = onSnapshot(
        query(collection(db, COLLECTIONS.ONSENS), where(documentId(), 'in', chunk)),
        (snap: FirebaseFirestoreTypes.QuerySnapshot) => {
          for (const d of snap.docs) {
            const data = d.data() as OnsenDocument;
            collected.set(d.id, {
              name: data.name,
              areaName: data.areaName,
              prefecture: data.prefecture,
              lat: data.lat,
              lng: data.lng,
              adultFee: data.adultFee,
            });
          }
          pending--;
          if (pending <= 0) {
            setOnsenMap(new Map(collected));
          }
        }
      );
      unsubscribes.push(unsub);
    }

    return () => unsubscribes.forEach((u) => u());
  }, [challenge]);

  // Load the challenge's active route (cosmetic). A dangling activeRouteId —
  // the route was deleted — resolves to null and is shown as "no route".
  useEffect(() => {
    const routeId = challenge?.activeRouteId;
    if (!user || !routeId) {
      setActiveRoute(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.ROUTES, routeId),
      (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) =>
        setActiveRoute(snapshot.exists() ? (snapshot.data() as RouteDocument) : null),
      () => setActiveRoute(null)
    );
    return unsub;
  }, [user, challenge?.activeRouteId]);

  const rows = useMemo<OnsenRow[]>(() => {
    if (!challenge) return [];
    // Grouping/order (unvisited first, by prefecture, then name) is applied by OnsenList.
    return challenge.snapshotEligibleOnsenIds.map((id) => {
      const info = onsenMap.get(id);
      return {
        id,
        name: info?.name ?? id,
        areaName: info?.areaName ?? '',
        prefecture: info?.prefecture ?? '',
        // 0/0 is far from Kyushu, so an onsen whose info hasn't loaded just
        // won't appear in the "near you" section until it does.
        lat: info?.lat ?? 0,
        lng: info?.lng ?? 0,
        visited: visitedIds.has(id),
      };
    });
  }, [challenge, onsenMap, visitedIds]);

  const eligibleVisitCount = useMemo(() => {
    if (!challenge) return 0;
    const eligible = new Set(challenge.snapshotEligibleOnsenIds);
    return [...visitedIds].filter((id) => eligible.has(id)).length;
  }, [challenge, visitedIds]);

  const selectRoute = useCallback(() => {
    if (!challengeId) return;
    router.push({ pathname: '/routes', params: { selectFor: challengeId } });
  }, [challengeId]);

  const clearRoute = useCallback(async () => {
    if (!user || !challengeId) return;
    try {
      await updateDoc(
        doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.CHALLENGES, challengeId),
        { activeRouteId: null, updatedAt: serverTimestamp() }
      );
    } catch (error) {
      Alert.alert(t('challengeProgress.errorRoute'), t(firebaseErrorKey(error)));
    }
  }, [user, challengeId, t]);

  return {
    loading,
    hasChallenge,
    challengeId,
    challenge,
    tiers,
    completionCount,
    eligibleVisitCount,
    activeRoute,
    visitedIds,
    visits,
    onsenMap,
    rows,
    clearRoute,
    selectRoute,
  };
}
