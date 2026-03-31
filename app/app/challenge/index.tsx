import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import firestore from '@react-native-firebase/firestore';
import type { UserDocument, ChallengeDocument, OnsenDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
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
  const [challenge, setChallenge] = useState<ChallengeDocument | null>(null);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
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
        const challengeId = data?.defaultChallengeId ?? null;

        cleanupInner();

        if (!challengeId) {
          setChallenge(null);
          setLoading(false);
          return;
        }

        unsubChallenge = firestore()
          .collection(COLLECTIONS.USERS)
          .doc(user.uid)
          .collection(SUBCOLLECTIONS.CHALLENGES)
          .doc(challengeId)
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
              .doc(challengeId)
              .collection(SUBCOLLECTIONS.VISITS)
              .onSnapshot((visitsSnap) => {
                setVisitedIds(new Set(visitsSnap.docs.map((d) => d.id)));
                setLoading(false);
              });
          });
      });

    return () => {
      cleanupInner();
      unsubUser();
    };
  }, [user]);

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
          <Text style={styles.progress}>
            {t('home.progress', {
              visited: eligibleVisitCount,
              total: 88,
            })}
          </Text>
        </View>

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
