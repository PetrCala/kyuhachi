import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import firestore from '@react-native-firebase/firestore';
import type { ChallengeTypeDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS, CATALOG_META_DOC_ID } from '@kyuhachi/shared';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography, radii } from '../../src/theme';

export default function NewChallenge() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [challengeType, setChallengeType] = useState<ChallengeTypeDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const unsubscribe = firestore()
      .collection(COLLECTIONS.CHALLENGE_TYPES)
      .doc('kyushu-88')
      .onSnapshot(
        (doc) => {
          setChallengeType(doc.exists() ? (doc.data() as ChallengeTypeDocument) : null);
          setLoading(false);
        },
        () => setLoading(false)
      );
    return unsubscribe;
  }, []);

  async function handleCreate() {
    if (!user || !challengeType) return;
    setCreating(true);
    try {
      // Read current catalog version
      const catalogSnap = await firestore()
        .collection(COLLECTIONS.CATALOG_META)
        .doc(CATALOG_META_DOC_ID)
        .get();
      const catalogVersion = catalogSnap.exists()
        ? (catalogSnap.data()?.version as number) ?? 1
        : 1;

      const batch = firestore().batch();

      // Create challenge document
      const challengeRef = firestore()
        .collection(COLLECTIONS.USERS)
        .doc(user.uid)
        .collection(SUBCOLLECTIONS.CHALLENGES)
        .doc();

      batch.set(challengeRef, {
        typeId: 'kyushu-88',
        name: t('challenge.defaultName'),
        startDate: firestore.FieldValue.serverTimestamp(),
        isDefault: true,
        snapshotEligibleOnsenIds: challengeType.eligibleOnsenIds,
        snapshotCatalogVersion: catalogVersion,
        activePlanId: null,
        claimedTier: null,
        completedAt: null,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // Update user's defaultChallengeId
      const userRef = firestore()
        .collection(COLLECTIONS.USERS)
        .doc(user.uid);
      batch.update(userRef, { defaultChallengeId: challengeRef.id });

      await batch.commit();
      router.replace('/');
    } catch (error) {
      Alert.alert(
        t('challenge.errorCreate'),
        error instanceof Error ? error.message : ''
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </>
    );
  }

  if (!challengeType) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('challenge.errorLoad')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: '', headerShown: true }} />
      <View style={styles.container}>
        <Text style={styles.title}>{t('challenge.startTitle')}</Text>
        <Text style={styles.challengeName}>{challengeType.name}</Text>
        <Text style={styles.description}>{t('challenge.startDescription')}</Text>
        <Text style={styles.eligibleCount}>
          {t('home.progress', {
            visited: 0,
            total: challengeType.completionCount,
          })}
        </Text>
        <Pressable
          style={[styles.startButton, creating && styles.startButtonDisabled]}
          onPress={handleCreate}
          disabled={creating}
        >
          <Text style={styles.startButtonText}>
            {creating ? t('challenge.startingButton') : t('challenge.startButton')}
          </Text>
        </Pressable>
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing[8],
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing[4],
    textAlign: 'center',
  },
  challengeName: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing[4],
  },
  description: {
    fontSize: typography.sizes.md,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: spacing[6],
    lineHeight: 24,
  },
  eligibleCount: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing[10],
  },
  startButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[4],
  },
  startButtonDisabled: {
    opacity: 0.4,
  },
  startButtonText: {
    color: colors.actionPrimaryText,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    textAlign: 'center',
  },
});
