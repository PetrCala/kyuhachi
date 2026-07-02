import { useState, useEffect, useMemo, useCallback } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  Timestamp,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import type {
  UserDocument,
  ChallengeDocument,
  ChallengeTypeDocument,
  Rank,
  RouteDocument,
  Tier,
  TransportMode,
  VisitDocument,
} from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { useOnsenCatalog } from '@/context/OnsenCatalogContext';
import { db, functions } from '@/firebase';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import { localizeTier } from '@/lib/challenge-i18n';
import { countShortcuts, highestEligibleTier, type TierProgress } from '@/lib/tier-eligibility';
import { highestAchievedRank, nextRankToEarn, type RankProgress } from '@/lib/rank';

export interface OnsenRow {
  id: string;
  name: string;
  /** Hiragana reading of `name`; the within-prefecture sort key. null → fall back to `name`. */
  nameKana: string | null;
  /** Hepburn reading of `name`, shown under the kanji in non-JP UI. null = none published. */
  nameRomaji: string | null;
  areaName: string;
  prefecture: string;
  lat: number;
  lng: number;
  visited: boolean;
}

/** Display fields for an eligible onsen, keyed by onsenId in `onsenMap`. */
export interface OnsenDisplayInfo {
  name: string;
  /** Hiragana reading of `name`; the within-prefecture sort key. null → fall back to `name`. */
  nameKana: string | null;
  /** Hepburn reading of `name`, shown under the kanji in non-JP UI. null = none published. */
  nameRomaji: string | null;
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
  /**
   * The official progression ranks for the active challenge type, ordered
   * worst → best (raw — `name` is the canonical Japanese title; localize the
   * display label with `rankLabel`). Empty when the type publishes none.
   */
  ranks: Rank[];
  completionCount: number | null;
  /**
   * The challenge's transport ceiling (from the challenge type). A visit by a
   * faster mode is a "shortcut". Null until the challenge type resolves. Exposed
   * for the Stats transport breakdown; tier eligibility uses it internally too.
   */
  baseMode: TransportMode | null;
  eligibleVisitCount: number;
  /** Distinct prefectures represented among the eligible visits. */
  distinctPrefectures: number;
  /** The highest rank currently achieved (derived from progress), or null. */
  currentRank: Rank | null;
  /** The next rank to aim for, or null once the apex rank is reached. */
  nextRank: Rank | null;
  /**
   * The highest tier the challenge currently *qualifies* for (claimed or not),
   * or null. Drives the Claim/Upgrade button; the claim itself is verified
   * server-side by the claimTier callable.
   */
  eligibleTier: Tier | null;
  /** True while a claimTier callable request is in flight. */
  claiming: boolean;
  /** Claim the highest currently-eligible tier via the server callable. */
  claimTier: () => Promise<void>;
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
 * type (tiers / completion target / baseMode), the eligible onsens' display
 * data, and the active route. The claimed tier (`challenge.earnedTier`) is read
 * straight off the challenge doc; eligibility for the next claim is derived here
 * and the claim is committed through the `claimTier` server callable.
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
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [completionCount, setCompletionCount] = useState<number | null>(null);
  const [baseMode, setBaseMode] = useState<TransportMode | null>(null);
  const { onsenMap: catalogMap } = useOnsenCatalog();
  const [activeRoute, setActiveRoute] = useState<RouteDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

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
            // Same pending-write fill as the visits below: a challenge created
            // offline reports its serverTimestamp() fields as null until the
            // write syncs, and consumers read them unguarded (Stats calls
            // startDate.toMillis()).
            const challengeEstimate = Timestamp.now();
            setChallenge({
              ...challengeData,
              startDate: challengeData.startDate ?? challengeEstimate,
              createdAt: challengeData.createdAt ?? challengeEstimate,
            });

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

  // Listen to challenge type for tiers and ranks
  useEffect(() => {
    if (!challenge) {
      setTiers([]);
      setRanks([]);
      setCompletionCount(null);
      setBaseMode(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, COLLECTIONS.CHALLENGE_TYPES, challenge.typeId),
      (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
        if (!snapshot.exists()) {
          setTiers([]);
          setRanks([]);
          setCompletionCount(null);
          setBaseMode(null);
          return;
        }
        const data = snapshot.data() as ChallengeTypeDocument;
        setTiers((data.tiers ?? []).map((tier) => localizeTier(challenge.typeId, tier, t)));
        // Ranks stay raw (kanji names) — the UI localizes the label per locale.
        setRanks(data.ranks ?? []);
        setCompletionCount(data.completionCount);
        setBaseMode(data.baseMode ?? null);
      }
    );
    return unsub;
  }, [challenge?.typeId, t]);

  // Display data for the eligible IDs, resolved from the offline-first catalog
  // store (which holds every onsen ever published, so a snapshot id always
  // resolves once the catalog is loaded — even for since-archived onsens).
  const onsenMap = useMemo<Map<string, OnsenDisplayInfo>>(() => {
    const collected = new Map<string, OnsenDisplayInfo>();
    if (!challenge) return collected;
    for (const id of challenge.snapshotEligibleOnsenIds) {
      const data = catalogMap.get(id);
      if (!data) continue;
      collected.set(id, {
        name: data.name,
        nameKana: data.nameKana,
        nameRomaji: data.nameRomaji,
        areaName: data.areaName,
        prefecture: data.prefecture,
        lat: data.lat,
        lng: data.lng,
        adultFee: data.adultFee,
      });
    }
    return collected;
  }, [challenge, catalogMap]);

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
    // Grouping/order (unvisited first, by prefecture, then area, then name) is applied by OnsenList.
    return challenge.snapshotEligibleOnsenIds.map((id) => {
      const info = onsenMap.get(id);
      return {
        id,
        name: info?.name ?? id,
        nameKana: info?.nameKana ?? null,
        nameRomaji: info?.nameRomaji ?? null,
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

  // Distinct prefectures among eligible visits — the second axis ranks gate on.
  // A missing prefecture ('' until the onsen's display data loads) isn't counted.
  const distinctPrefectures = useMemo(() => {
    if (!challenge) return 0;
    const eligible = new Set(challenge.snapshotEligibleOnsenIds);
    const prefectures = new Set<string>();
    for (const id of visitedIds) {
      if (!eligible.has(id)) continue;
      const prefecture = onsenMap.get(id)?.prefecture;
      if (prefecture) prefectures.add(prefecture);
    }
    return prefectures.size;
  }, [challenge, visitedIds, onsenMap]);

  // The official progression rank, derived purely from progress (no claim). The
  // current rank is the highest rung met on both axes; the next is the one to
  // aim for. Both null until the type publishes ranks.
  const currentRank = useMemo<Rank | null>(() => {
    if (ranks.length === 0) return null;
    const progress: RankProgress = { eligibleVisits: eligibleVisitCount, distinctPrefectures };
    return highestAchievedRank(ranks, progress);
  }, [ranks, eligibleVisitCount, distinctPrefectures]);

  const nextRank = useMemo<Rank | null>(() => {
    if (ranks.length === 0) return null;
    const progress: RankProgress = { eligibleVisits: eligibleVisitCount, distinctPrefectures };
    return nextRankToEarn(ranks, progress);
  }, [ranks, eligibleVisitCount, distinctPrefectures]);

  // The tier the challenge currently qualifies for — gates the Claim/Upgrade
  // button. Mirrors the server's check (the callable re-verifies before writing).
  const eligibleTier = useMemo<Tier | null>(() => {
    if (!challenge || tiers.length === 0) return null;
    const eligibleSet = new Set(challenge.snapshotEligibleOnsenIds);
    const transports: (TransportMode | null)[] = [];
    for (const [onsenId, visit] of visits) {
      if (eligibleSet.has(onsenId)) {
        transports.push(visit.structuredData?.transportMode ?? null);
      }
    }
    const daysSinceStart = challenge.startDate
      ? Math.floor((Date.now() - challenge.startDate.toMillis()) / 86_400_000)
      : 0;
    const progress: TierProgress = {
      eligibleVisits: eligibleVisitCount,
      shortcutCount: countShortcuts(transports, baseMode),
      daysSinceStart,
    };
    return highestEligibleTier(tiers, progress);
  }, [challenge, tiers, visits, baseMode, eligibleVisitCount]);

  // Opens the unified Routes screen. Attaching a route to the challenge now
  // happens there via each route's ⋯ menu, not by tapping — so this no longer
  // needs to pass the challenge id.
  const selectRoute = useCallback(() => {
    router.push('/routes');
  }, []);

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

  // Commit a claim through the server callable — the sole writer of earnedTier.
  // The new value lands via the challenge snapshot, which drives the celebration.
  const claimTier = useCallback(async () => {
    if (!challengeId || claiming) return;
    setClaiming(true);
    try {
      await httpsCallable(functions, 'claimTier')({ challengeId });
    } catch (error) {
      Alert.alert(t('challengeProgress.errorClaim'), t(firebaseErrorKey(error)));
    } finally {
      setClaiming(false);
    }
  }, [challengeId, claiming, t]);

  return {
    loading,
    hasChallenge,
    challengeId,
    challenge,
    tiers,
    ranks,
    completionCount,
    baseMode,
    eligibleVisitCount,
    distinctPrefectures,
    currentRank,
    nextRank,
    eligibleTier,
    claiming,
    claimTier,
    activeRoute,
    visitedIds,
    visits,
    onsenMap,
    rows,
    clearRoute,
    selectRoute,
  };
}
