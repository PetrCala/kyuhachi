import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  writeBatch,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { ChallengeDocument, ChallengeTypeDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import { colors, spacing, typography, radii } from '@/theme';

interface ChallengeRow {
  id: string;
  data: ChallengeDocument;
}

interface TypeInfo {
  name: string;
  completionCount: number;
}

export default function ChallengeList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [typeInfo, setTypeInfo] = useState<Map<string, TypeInfo>>(new Map());
  const [progress, setProgress] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  // Subscribe to the user's challenges
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.CHALLENGES),
      (snap: FirebaseFirestoreTypes.QuerySnapshot) => {
        setChallenges(
          snap.docs.map((d) => ({ id: d.id, data: d.data() as ChallengeDocument }))
        );
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
        if (data) map.set(id, { name: data.name, completionCount: data.completionCount });
      }
      setTypeInfo(map);
    });
    return () => {
      cancelled = true;
    };
  }, [typeIdsKey]);

  // Count eligible visits per challenge (snapshot at open; refreshes on add/delete)
  const progressKey = useMemo(
    () => challenges.map((c) => c.id).sort().join(','),
    [challenges]
  );
  useEffect(() => {
    if (!user || challenges.length === 0) {
      setProgress(new Map());
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
        return [c.id, visitsSnap.docs.filter((d) => eligible.has(d.id)).length] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setProgress(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, progressKey]);

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
      Alert.alert(t('challengeList.errorSwitch'), error instanceof Error ? error.message : '');
    }
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
      Alert.alert(t('challengeList.errorDelete'), error instanceof Error ? error.message : '');
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
          const visited = progress.get(id);
          return (
            <View key={id} style={styles.card}>
              <Pressable style={styles.cardMain} onPress={() => switchTo(id)} disabled={isActive}>
                <Text style={styles.cardName}>{data.name}</Text>
                <Text style={styles.cardType}>{info?.name ?? data.typeId}</Text>
                {info && visited !== undefined && (
                  <Text style={styles.cardProgress}>
                    {t('home.progress', { visited, total: info.completionCount })}
                  </Text>
                )}
              </Pressable>
              {isActive ? (
                <Text style={styles.activeBadge}>{t('challengeList.active')}</Text>
              ) : (
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => confirmDelete(id, data.name)}
                >
                  <Text style={styles.deleteButtonText}>{t('challengeList.delete')}</Text>
                </Pressable>
              )}
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
  deleteButton: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteButtonText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
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
