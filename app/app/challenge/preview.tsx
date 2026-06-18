import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import firestore from '@react-native-firebase/firestore';
import type { ChallengeTypeDocument, UserDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS, CATALOG_META_DOC_ID } from '@kyuhachi/shared';
import { useAuth } from '../../src/context/AuthContext';
import { ChallengeRulesView } from '../../src/components/ChallengeRulesView';
import { colors, spacing, typography, radii } from '../../src/theme';

export default function ChallengePreview() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { typeId } = useLocalSearchParams<{ typeId: string }>();
  const [challengeType, setChallengeType] = useState<ChallengeTypeDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!typeId) {
      setLoading(false);
      return;
    }
    const unsubscribe = firestore()
      .collection(COLLECTIONS.CHALLENGE_TYPES)
      .doc(typeId)
      .onSnapshot(
        (doc) => {
          setChallengeType(doc.exists() ? (doc.data() as ChallengeTypeDocument) : null);
          setLoading(false);
        },
        () => setLoading(false)
      );
    return unsubscribe;
  }, [typeId]);

  async function handleCreate() {
    if (!user || !typeId || !challengeType) return;
    setCreating(true);
    try {
      const catalogSnap = await firestore()
        .collection(COLLECTIONS.CATALOG_META)
        .doc(CATALOG_META_DOC_ID)
        .get();
      const catalogVersion = catalogSnap.exists()
        ? (catalogSnap.data()?.version as number) ?? 1
        : 1;

      // Creating a challenge makes it the active (default) one. Demote the
      // previous default so at most one challenge is ever isDefault.
      const userRef = firestore().collection(COLLECTIONS.USERS).doc(user.uid);
      const userSnap = await userRef.get();
      const previousDefaultId =
        (userSnap.data() as UserDocument | undefined)?.defaultChallengeId ?? null;

      const batch = firestore().batch();

      const challengeRef = userRef.collection(SUBCOLLECTIONS.CHALLENGES).doc();
      batch.set(challengeRef, {
        typeId,
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

      if (previousDefaultId) {
        batch.update(
          userRef.collection(SUBCOLLECTIONS.CHALLENGES).doc(previousDefaultId),
          { isDefault: false }
        );
      }

      batch.update(userRef, { defaultChallengeId: challengeRef.id });

      await batch.commit();
      router.replace('/');
    } catch (error) {
      Alert.alert(t('challenge.errorCreate'), error instanceof Error ? error.message : '');
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
      <Stack.Screen options={{ title: challengeType.name, headerShown: true }} />
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ChallengeRulesView challengeType={challengeType} />
        </ScrollView>
        <View style={styles.footer}>
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
  content: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    paddingBottom: spacing[8],
  },
  footer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[6],
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    backgroundColor: colors.background,
  },
  startButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  startButtonDisabled: {
    opacity: 0.4,
  },
  startButtonText: {
    color: colors.actionPrimaryText,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
