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
  TierCondition,
  TransportMode,
  VisitDocument,
} from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS, isFasterThan } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import { localizeTier } from '@/lib/challenge-i18n';

export interface OnsenRow {
  id: string;
  name: string;
  areaName: string;
  visited: boolean;
}

/** Display fields for an eligible onsen, keyed by onsenId in `onsenMap`. */
export interface OnsenDisplayInfo {
  name: string;
  areaName: string;
  prefecture: string;
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
  /** First eligible tier (tiers are ordered best → worst), or null. */
  highestEligibleTier: Tier | null;
  canUpgrade: boolean;
  activeRoute: RouteDocument | null;
  /** kyuhachiIds of every onsen visited in the active challenge (not just eligible ones). */
  visitedIds: Set<string>;
  /** Every visit in the active challenge, keyed by onsenId. */
  visits: Map<string, VisitDocument>;
  /** Display info for the active challenge's eligible onsens, keyed by onsenId. */
  onsenMap: Map<string, OnsenDisplayInfo>;
  /** Eligible onsens for the active challenge; display order is handled by OnsenList. */
  rows: OnsenRow[];
  claimTier: (tierId: string) => Promise<void>;
  clearRoute: () => Promise<void>;
  selectRoute: () => void;
}

/**
 * The shared data layer for the home dashboard and the record-a-visit list.
 * Subscribes to the active challenge (user → challenge → visits), its challenge
 * type (tiers / completion target / base transport mode), the eligible onsens'
 * display data, and the active route, then derives tier eligibility.
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
  const [baseMode, setBaseMode] = useState<TransportMode | null>(null);
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
                const visitMap = new Map<string, VisitDocument>();
                for (const d of visitsSnap.docs) {
                  visitMap.set(d.id, d.data() as VisitDocument);
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
      setBaseMode(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, COLLECTIONS.CHALLENGE_TYPES, challenge.typeId),
      (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
        if (!snapshot.exists()) {
          setTiers([]);
          setCompletionCount(null);
          setBaseMode(null);
          return;
        }
        const data = snapshot.data() as ChallengeTypeDocument;
        setTiers((data.tiers ?? []).map((tier) => localizeTier(challenge.typeId, tier, t)));
        setCompletionCount(data.completionCount);
        setBaseMode(data.baseMode ?? null);
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
    // Display order (visited last, then area, then name) is applied by OnsenList.
    return challenge.snapshotEligibleOnsenIds.map((id) => {
      const info = onsenMap.get(id);
      return {
        id,
        name: info?.name ?? id,
        areaName: info?.areaName ?? '',
        visited: visitedIds.has(id),
      };
    });
  }, [challenge, onsenMap, visitedIds]);

  const eligibleVisitCount = useMemo(() => {
    if (!challenge) return 0;
    const eligible = new Set(challenge.snapshotEligibleOnsenIds);
    return [...visitedIds].filter((id) => eligible.has(id)).length;
  }, [challenge, visitedIds]);

  const shortcutCount = useMemo(() => {
    if (!challenge || !baseMode) return 0;
    const eligible = new Set(challenge.snapshotEligibleOnsenIds);
    let count = 0;
    for (const [id, visit] of visits) {
      if (eligible.has(id) && isFasterThan(visit.structuredData.transportMode, baseMode)) {
        count++;
      }
    }
    return count;
  }, [challenge, visits, baseMode]);

  const daysSinceStart = useMemo(() => {
    if (!challenge?.startDate) return 0;
    const start = challenge.startDate.toDate();
    return Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
  }, [challenge?.startDate]);

  const isTierEligible = useCallback(
    (tier: Tier): boolean => {
      return tier.conditions.every((cond: TierCondition) => {
        switch (cond.type) {
          case 'minVisits':
            return eligibleVisitCount >= cond.value;
          case 'maxFasterVisits':
            return shortcutCount <= cond.value;
          case 'maxCalendarDays':
            return daysSinceStart <= cond.value;
          default:
            return false;
        }
      });
    },
    [eligibleVisitCount, shortcutCount, daysSinceStart]
  );

  // Tiers are ordered best → worst; first eligible is the highest
  const highestEligibleTier = useMemo(() => {
    return tiers.find((tier) => isTierEligible(tier)) ?? null;
  }, [tiers, isTierEligible]);

  const canUpgrade = useMemo(() => {
    if (!challenge?.claimedTier || !highestEligibleTier) return false;
    const claimedIndex = tiers.findIndex((tier) => tier.id === challenge.claimedTier);
    const highestIndex = tiers.findIndex((tier) => tier.id === highestEligibleTier.id);
    // Lower index = better tier (ordered best → worst)
    return highestIndex < claimedIndex;
  }, [challenge?.claimedTier, highestEligibleTier, tiers]);

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

  const claimTier = useCallback(
    async (tierId: string) => {
      if (!user || !challengeId) return;
      try {
        await updateDoc(
          doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.CHALLENGES, challengeId),
          { claimedTier: tierId, updatedAt: serverTimestamp() }
        );
      } catch (error) {
        Alert.alert(t('challengeProgress.errorClaim'), t(firebaseErrorKey(error)));
      }
    },
    [user, challengeId, t]
  );

  return {
    loading,
    hasChallenge,
    challengeId,
    challenge,
    tiers,
    completionCount,
    eligibleVisitCount,
    highestEligibleTier,
    canUpgrade,
    activeRoute,
    visitedIds,
    visits,
    onsenMap,
    rows,
    claimTier,
    clearRoute,
    selectRoute,
  };
}
