import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import firestore from '@react-native-firebase/firestore';
import type {
  UserDocument,
  ChallengeDocument,
  ChallengeTypeDocument,
  OnsenDocument,
  Tier,
  TierCondition,
  TransportMode,
  VisitDocument,
} from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS, isFasterThan } from '@kyuhachi/shared';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography, radii } from '../../src/theme';

interface OnsenRow {
  id: string;
  name: string;
  areaName: string;
  visited: boolean;
}

export default function ChallengeProgress() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<ChallengeDocument | null>(null);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [visits, setVisits] = useState<Map<string, VisitDocument>>(new Map());
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [completionCount, setCompletionCount] = useState<number | null>(null);
  const [baseMode, setBaseMode] = useState<TransportMode | null>(null);
  const [onsenMap, setOnsenMap] = useState<Map<string, { name: string; areaName: string }>>(
    new Map()
  );
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

    const unsubUser = firestore()
      .collection(COLLECTIONS.USERS)
      .doc(user.uid)
      .onSnapshot((doc) => {
        const data = doc.data() as UserDocument | undefined;
        const defChallengeId = data?.defaultChallengeId ?? null;
        setChallengeId(defChallengeId);

        cleanupInner();

        if (!defChallengeId) {
          setChallenge(null);
          setLoading(false);
          return;
        }

        unsubChallenge = firestore()
          .collection(COLLECTIONS.USERS)
          .doc(user.uid)
          .collection(SUBCOLLECTIONS.CHALLENGES)
          .doc(defChallengeId)
          .onSnapshot((challengeDoc) => {
            if (!challengeDoc.exists()) {
              setChallenge(null);
              setLoading(false);
              return;
            }

            const challengeData = challengeDoc.data() as ChallengeDocument;
            setChallenge(challengeData);

            unsubVisits?.();
            unsubVisits = firestore()
              .collection(COLLECTIONS.USERS)
              .doc(user.uid)
              .collection(SUBCOLLECTIONS.CHALLENGES)
              .doc(defChallengeId)
              .collection(SUBCOLLECTIONS.VISITS)
              .onSnapshot((visitsSnap) => {
                setVisitedIds(new Set(visitsSnap.docs.map((d) => d.id)));
                const visitMap = new Map<string, VisitDocument>();
                for (const doc of visitsSnap.docs) {
                  visitMap.set(doc.id, doc.data() as VisitDocument);
                }
                setVisits(visitMap);
                setLoading(false);
              });
          });
      });

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
    const unsub = firestore()
      .collection(COLLECTIONS.CHALLENGE_TYPES)
      .doc(challenge.typeId)
      .onSnapshot((doc) => {
        if (!doc.exists()) {
          setTiers([]);
          setCompletionCount(null);
          setBaseMode(null);
          return;
        }
        const data = doc.data() as ChallengeTypeDocument;
        setTiers(data.tiers ?? []);
        setCompletionCount(data.completionCount);
        setBaseMode(data.baseMode ?? null);
      });
    return unsub;
  }, [challenge?.typeId]);

  // Fetch onsen display data for eligible IDs
  useEffect(() => {
    if (!challenge) return;

    const ids = challenge.snapshotEligibleOnsenIds;
    if (ids.length === 0) return;

    // Firestore 'in' queries support max 30 values, so batch
    const BATCH_SIZE = 30;
    const unsubscribes: (() => void)[] = [];
    const collected = new Map<string, { name: string; areaName: string }>();

    let pending = Math.ceil(ids.length / BATCH_SIZE);

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      const unsub = firestore()
        .collection(COLLECTIONS.ONSENS)
        .where(firestore.FieldPath.documentId(), 'in', chunk)
        .onSnapshot((snap) => {
          for (const doc of snap.docs) {
            const data = doc.data() as OnsenDocument;
            collected.set(doc.id, { name: data.name, areaName: data.areaName });
          }
          pending--;
          if (pending <= 0) {
            setOnsenMap(new Map(collected));
          }
        });
      unsubscribes.push(unsub);
    }

    return () => unsubscribes.forEach((u) => u());
  }, [challenge]);

  const rows = useMemo<OnsenRow[]>(() => {
    if (!challenge) return [];
    return challenge.snapshotEligibleOnsenIds
      .map((id) => {
        const info = onsenMap.get(id);
        return {
          id,
          name: info?.name ?? id,
          areaName: info?.areaName ?? '',
          visited: visitedIds.has(id),
        };
      })
      .sort((a, b) => {
        // Visited last, then alphabetical by area then name
        if (a.visited !== b.visited) return a.visited ? 1 : -1;
        const areaComp = a.areaName.localeCompare(b.areaName);
        if (areaComp !== 0) return areaComp;
        return a.name.localeCompare(b.name);
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

  function isTierEligible(tier: Tier): boolean {
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
  }

  // Tiers are ordered best → worst; first eligible is the highest
  const highestEligibleTier = useMemo(() => {
    return tiers.find((tier) => isTierEligible(tier)) ?? null;
  }, [tiers, eligibleVisitCount, shortcutCount, daysSinceStart]);

  const canUpgrade = useMemo(() => {
    if (!challenge?.claimedTier || !highestEligibleTier) return false;
    const claimedIndex = tiers.findIndex((t) => t.id === challenge.claimedTier);
    const highestIndex = tiers.findIndex((t) => t.id === highestEligibleTier.id);
    // Lower index = better tier (ordered best → worst)
    return highestIndex < claimedIndex;
  }, [challenge?.claimedTier, highestEligibleTier, tiers]);

  async function handleClaimTier(tierId: string) {
    if (!user || !challengeId) return;
    try {
      await firestore()
        .collection(COLLECTIONS.USERS)
        .doc(user.uid)
        .collection(SUBCOLLECTIONS.CHALLENGES)
        .doc(challengeId)
        .update({
          claimedTier: tierId,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : '');
    }
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('challengeProgress.title'), headerShown: true }} />
        <ActivityIndicator style={styles.centered} />
      </>
    );
  }

  if (!challenge) {
    return (
      <>
        <Stack.Screen options={{ title: t('challengeProgress.title'), headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('home.noChallenge')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('challengeProgress.title'), headerShown: true }} />
      <View style={styles.container}>
        <View style={styles.headerSection}>
          <Text style={styles.challengeName}>{challenge.name}</Text>
          {completionCount !== null && (
            <Text style={styles.progress}>
              {t('home.progress', {
                visited: eligibleVisitCount,
                total: completionCount,
              })}
            </Text>
          )}
          <View style={styles.headerActions}>
            <Pressable
              style={styles.pillButton}
              onPress={() =>
                router.push({
                  pathname: '/challenge/rules',
                  params: { typeId: challenge.typeId },
                })
              }
            >
              <Text style={styles.pillButtonText}>{t('challengeRules.title')}</Text>
            </Pressable>
            <Pressable
              style={styles.pillButton}
              onPress={() => router.push('/challenge/new')}
            >
              <Text style={styles.pillButtonText}>{t('challengeProgress.newChallenge')}</Text>
            </Pressable>
          </View>
        </View>

        {tiers.length > 0 && (
          <View style={styles.tierSection}>
            <Text style={styles.tierTitle}>{t('challengeProgress.tiers')}</Text>
            {tiers.map((tier) => {
              const eligible = isTierEligible(tier);
              return (
                <View key={tier.id} style={styles.tierRow}>
                  <View style={styles.tierInfo}>
                    <Text style={[styles.tierName, !eligible && styles.tierDimmed]}>
                      {tier.name}
                    </Text>
                    <Text style={[styles.tierSummary, !eligible && styles.tierDimmed]}>
                      {tier.conditionSummary}
                    </Text>
                  </View>
                  <Text style={eligible ? styles.tierEligibleBadge : styles.tierNotEligibleBadge}>
                    {eligible
                      ? t('challengeProgress.tierEligible')
                      : t('challengeProgress.tierNotEligible')}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {tiers.length > 0 && challenge.claimedTier && !canUpgrade && (
          <View style={styles.claimSection}>
            <View style={styles.claimedBadge}>
              <Text style={styles.claimedBadgeText}>
                {t('challengeProgress.claimedTier', {
                  tier: tiers.find((t) => t.id === challenge.claimedTier)?.name ?? challenge.claimedTier,
                })}
              </Text>
            </View>
          </View>
        )}

        {highestEligibleTier && !challenge.claimedTier && (
          <View style={styles.claimSection}>
            <Pressable
              style={styles.claimButton}
              onPress={() => handleClaimTier(highestEligibleTier.id)}
            >
              <Text style={styles.claimButtonText}>
                {t('challengeProgress.claimTier', { tier: highestEligibleTier.name })}
              </Text>
            </Pressable>
          </View>
        )}

        {highestEligibleTier && canUpgrade && (
          <View style={styles.claimSection}>
            <Text style={styles.claimedCurrentText}>
              {t('challengeProgress.claimedTier', {
                tier: tiers.find((t) => t.id === challenge.claimedTier)?.name ?? challenge.claimedTier,
              })}
            </Text>
            <Pressable
              style={styles.claimButton}
              onPress={() => handleClaimTier(highestEligibleTier.id)}
            >
              <Text style={styles.claimButtonText}>
                {t('challengeProgress.upgradeTier', { tier: highestEligibleTier.name })}
              </Text>
            </Pressable>
          </View>
        )}

        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/onsens/${item.id}`)}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowArea}>{item.areaName}</Text>
              </View>
              <Text style={item.visited ? styles.checkmark : styles.unvisited}>
                {item.visited ? '✓' : '○'}
              </Text>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </View>
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
  errorText: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerSection: {
    alignItems: 'center',
    paddingVertical: spacing[6],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  challengeName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginBottom: spacing[2],
  },
  progress: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  pillButton: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.full,
  },
  pillButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  tierSection: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  tierTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
    marginBottom: spacing[3],
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  tierInfo: {
    flex: 1,
  },
  tierName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  tierSummary: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  tierDimmed: {
    opacity: 0.4,
  },
  tierEligibleBadge: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.actionPrimary,
    marginLeft: spacing[2],
  },
  tierNotEligibleBadge: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textPlaceholder,
    marginLeft: spacing[2],
  },
  claimSection: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    alignItems: 'center',
  },
  claimedBadge: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  claimedBadgeText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimary,
  },
  claimedCurrentText: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing[2],
  },
  claimButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
  },
  claimButtonText: {
    color: colors.actionPrimaryText,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    backgroundColor: colors.background,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  rowArea: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  checkmark: {
    fontSize: typography.sizes.xl,
    color: colors.actionPrimary,
    marginLeft: spacing[2],
  },
  unvisited: {
    fontSize: typography.sizes.xl,
    color: colors.textPlaceholder,
    marginLeft: spacing[2],
  },
  separator: {
    height: 1,
    backgroundColor: colors.separator,
    marginLeft: spacing[4],
  },
});
