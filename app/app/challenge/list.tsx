import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  LayoutAnimation,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  writeBatch,
  serverTimestamp,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type {
  ChallengeDocument,
  ChallengeTypeDocument,
  Tier,
  TransportMode,
  VisitDocument,
} from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import { challengeTypeName } from '@/lib/challenge-i18n';
import { countShortcuts, highestEligibleTier } from '@/lib/tier-eligibility';
import RowActionsButton from '@/components/RowActionsButton';
import { ChallengeBadge } from '@/components/ChallengeBadge';
import { colors, spacing, typography, radii } from '@/theme';

interface ChallengeRow {
  id: string;
  data: ChallengeDocument;
}

interface TypeInfo {
  name: string;
  completionCount: number;
  tiers: Tier[];
  baseMode: TransportMode;
}

interface ChallengeStats {
  eligibleVisits: number;
  /** Transport mode of each eligible visit — drives the shortcut count. */
  eligibleTransports: (TransportMode | null)[];
}

/** Fades its child in on mount, so the tier marker appears smoothly once its
 *  (asynchronously loaded) tier resolves rather than snapping into place. */
function FadeIn({ children }: { children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

export default function ChallengeList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [typeInfo, setTypeInfo] = useState<Map<string, TypeInfo>>(new Map());
  const [stats, setStats] = useState<Map<string, ChallengeStats>>(new Map());
  const [loading, setLoading] = useState(true);
  // Track the active challenge across snapshots so we can animate the list
  // settling only when it actually changes (not on first load or unrelated edits).
  const initializedRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);

  // Subscribe to the user's challenges
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.CHALLENGES),
      (snap: FirebaseFirestoreTypes.QuerySnapshot) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as ChallengeDocument,
        }));
        // When the active challenge changes it jumps to the top of the sorted
        // list. Animate that next layout commit so the card visibly slides into
        // place instead of teleporting. Suppress it on the initial population.
        const nextActiveId = rows.find((r) => r.data.isDefault)?.id ?? null;
        if (initializedRef.current && nextActiveId !== activeIdRef.current) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        }
        initializedRef.current = true;
        activeIdRef.current = nextActiveId;
        setChallenges(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, [user]);

  // Resolve type display names + completion counts for the types in use
  const typeIdsKey = useMemo(
    () => [...new Set(challenges.map((c) => c.data.typeId))].sort().join(','),
    [challenges]
  );
  useEffect(() => {
    if (!typeIdsKey) {
      setTypeInfo(new Map());
      return;
    }
    let cancelled = false;
    Promise.all(
      typeIdsKey.split(',').map(async (id) => {
        const docSnap = await getDoc(doc(db, COLLECTIONS.CHALLENGE_TYPES, id));
        return [id, docSnap.data() as ChallengeTypeDocument | undefined] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      const map = new Map<string, TypeInfo>();
      for (const [id, data] of entries) {
        if (data) {
          map.set(id, {
            name: data.name,
            completionCount: data.completionCount,
            tiers: data.tiers ?? [],
            baseMode: data.baseMode,
          });
        }
      }
      setTypeInfo(map);
    });
    return () => {
      cancelled = true;
    };
  }, [typeIdsKey]);

  // Per-challenge eligible visit count + transports (snapshot at open; refreshes
  // on add/delete) — feeds both the progress text and the computed tier marker.
  const progressKey = useMemo(
    () => challenges.map((c) => c.id).sort().join(','),
    [challenges]
  );
  useEffect(() => {
    if (!user || challenges.length === 0) {
      setStats(new Map());
      return;
    }
    let cancelled = false;
    Promise.all(
      challenges.map(async (c) => {
        const visitsSnap: FirebaseFirestoreTypes.QuerySnapshot = await getDocs(
          collection(
            db,
            COLLECTIONS.USERS,
            user.uid,
            SUBCOLLECTIONS.CHALLENGES,
            c.id,
            SUBCOLLECTIONS.VISITS
          )
        );
        const eligible = new Set(c.data.snapshotEligibleOnsenIds);
        const eligibleDocs = visitsSnap.docs.filter((d) => eligible.has(d.id));
        const eligibleTransports = eligibleDocs.map(
          (d) => (d.data() as VisitDocument).structuredData?.transportMode ?? null
        );
        return [
          c.id,
          { eligibleVisits: eligibleDocs.length, eligibleTransports },
        ] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setStats(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, progressKey]);

  // The highest tier each challenge currently qualifies for, derived from its
  // progress (there is no stored "claimed" tier). null = no tier reached yet.
  const tierByChallenge = useMemo(() => {
    const map = new Map<string, Tier | null>();
    for (const c of challenges) {
      const info = typeInfo.get(c.data.typeId);
      const s = stats.get(c.id);
      if (!info || !s) continue;
      const daysSinceStart = c.data.startDate
        ? Math.floor((Date.now() - c.data.startDate.toDate().getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      map.set(
        c.id,
        highestEligibleTier(info.tiers, {
          eligibleVisits: s.eligibleVisits,
          shortcutCount: countShortcuts(s.eligibleTransports, info.baseMode),
          daysSinceStart,
        })
      );
    }
    return map;
  }, [challenges, typeInfo, stats]);

  const sorted = useMemo(() => {
    return [...challenges].sort((a, b) => {
      if (a.data.isDefault !== b.data.isDefault) return a.data.isDefault ? -1 : 1;
      const am = a.data.createdAt ? a.data.createdAt.toDate().getTime() : 0;
      const bm = b.data.createdAt ? b.data.createdAt.toDate().getTime() : 0;
      return bm - am;
    });
  }, [challenges]);

  async function switchTo(id: string) {
    if (!user) return;
    const active = challenges.find((c) => c.data.isDefault);
    if (active?.id === id) return;
    try {
      const userRef = doc(db, COLLECTIONS.USERS, user.uid);
      const challengesCol = collection(userRef, SUBCOLLECTIONS.CHALLENGES);
      const batch = writeBatch(db);
      if (active && active.id !== id) {
        batch.update(doc(challengesCol, active.id), { isDefault: false });
      }
      batch.update(doc(challengesCol, id), { isDefault: true });
      batch.update(userRef, { defaultChallengeId: id });
      await batch.commit();
    } catch (error) {
      Alert.alert(t('challengeList.errorSwitch'), t(firebaseErrorKey(error)));
    }
  }

  async function renameChallenge(id: string, name: string) {
    if (!user) return;
    try {
      await updateDoc(
        doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.CHALLENGES, id),
        { name, updatedAt: serverTimestamp() }
      );
    } catch (error) {
      Alert.alert(t('challengeList.errorRename'), t(firebaseErrorKey(error)));
    }
  }

  function promptRename(id: string, currentName: string) {
    Alert.prompt(
      t('challengeList.renameTitle'),
      t('challengeList.renameMessage'),
      [
        { text: t('challengeList.cancel'), style: 'cancel' },
        {
          text: t('challengeList.renameConfirm'),
          onPress: (value?: string) => {
            const name = value?.trim();
            if (name) renameChallenge(id, name);
          },
        },
      ],
      'plain-text',
      currentName
    );
  }

  async function deleteChallenge(id: string) {
    if (!user) return;
    try {
      const userRef = doc(db, COLLECTIONS.USERS, user.uid);
      const challengesCol = collection(userRef, SUBCOLLECTIONS.CHALLENGES);
      const visitsSnap: FirebaseFirestoreTypes.QuerySnapshot = await getDocs(
        collection(doc(challengesCol, id), SUBCOLLECTIONS.VISITS)
      );
      const batch = writeBatch(db);
      visitsSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(challengesCol, id));

      // Deleting the active challenge must clear the pointer too, otherwise
      // defaultChallengeId dangles and the next challenge creation fails with
      // firestore/not-found when it tries to demote the missing default.
      const wasDefault = challenges.find((c) => c.id === id)?.data.isDefault;
      if (wasDefault) {
        batch.update(userRef, { defaultChallengeId: null });
      }

      await batch.commit();
    } catch (error) {
      Alert.alert(t('challengeList.errorDelete'), t(firebaseErrorKey(error)));
    }
  }

  function confirmDelete(id: string, name: string) {
    Alert.alert(t('challengeList.deleteTitle'), t('challengeList.deleteMessage', { name }), [
      { text: t('challengeList.cancel'), style: 'cancel' },
      {
        text: t('challengeList.deleteConfirm'),
        style: 'destructive',
        onPress: () => deleteChallenge(id),
      },
    ]);
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('challengeList.title'), headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('challengeList.title'), headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.hint}>{t('challengeList.hint')}</Text>

        {sorted.map(({ id, data }) => {
          const isActive = data.isDefault;
          const info = typeInfo.get(data.typeId);
          const visited = stats.get(id)?.eligibleVisits;
          const tier = tierByChallenge.get(id);
          return (
            <View key={id} style={styles.card}>
              {/* Slot is always reserved (fixed width) so the marker fades in
                  when its tier resolves without shifting the card content. */}
              <View style={styles.tierMarker}>
                {tier ? (
                  <FadeIn>
                    <ChallengeBadge
                      tierId={tier.id}
                      size={spacing[10]}
                      accessibilityLabel={t('challengeList.tierMarkerLabel', {
                        tier: t(`challengeTier.${tier.id}`, { defaultValue: tier.id }),
                      })}
                    />
                  </FadeIn>
                ) : null}
              </View>
              <Pressable style={styles.cardMain} onPress={() => switchTo(id)} disabled={isActive}>
                <Text style={styles.cardName}>{data.name}</Text>
                <Text style={styles.cardType}>
                  {challengeTypeName(data.typeId, info?.name ?? data.typeId, t)}
                </Text>
                {info && visited !== undefined && (
                  <Text style={styles.cardProgress}>
                    {t('home.progress', { visited, total: info.completionCount })}
                  </Text>
                )}
              </Pressable>
              <View style={styles.actions}>
                {isActive && (
                  <Text style={styles.activeBadge}>{t('challengeList.active')}</Text>
                )}
                <RowActionsButton
                  accessibilityLabel={t('challengeList.moreActions')}
                  title={data.name}
                  cancelLabel={t('challengeList.cancel')}
                  actions={[
                    ...(!isActive
                      ? [{ label: t('challengeList.makeActive'), onPress: () => switchTo(id) }]
                      : []),
                    { label: t('challengeList.rename'), onPress: () => promptRename(id, data.name) },
                    ...(!isActive
                      ? [
                          {
                            label: t('challengeList.delete'),
                            destructive: true,
                            onPress: () => confirmDelete(id, data.name),
                          },
                        ]
                      : []),
                  ]}
                />
              </View>
            </View>
          );
        })}

        <Pressable style={styles.newButton} onPress={() => router.push('/challenge/new')}>
          <Text style={styles.newButtonText}>{t('challengeProgress.newChallenge')}</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    paddingBottom: spacing[8],
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing[5],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    marginBottom: spacing[3],
  },
  tierMarker: {
    width: spacing[10],
    marginRight: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMain: {
    flex: 1,
    marginRight: spacing[3],
  },
  cardName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  cardType: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  cardProgress: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing[1],
  },
  activeBadge: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
    backgroundColor: colors.actionPrimary,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  newButton: {
    marginTop: spacing[4],
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  newButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
  },
});
