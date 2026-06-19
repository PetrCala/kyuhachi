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
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { ChallengeTypeDocument, UserDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS, CATALOG_META_DOC_ID } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import { ChallengeRulesView } from '@/components/ChallengeRulesView';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import { localizeChallengeType } from '@/lib/challenge-i18n';
import { colors, spacing, typography, radii } from '@/theme';

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
    const unsubscribe = onSnapshot(
      doc(db, COLLECTIONS.CHALLENGE_TYPES, typeId),
      (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
        setChallengeType(snapshot.exists() ? (snapshot.data() as ChallengeTypeDocument) : null);
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
      const catalogSnap = await getDoc(doc(db, COLLECTIONS.CATALOG_META, CATALOG_META_DOC_ID));
      const catalogVersion = catalogSnap.exists()
        ? (catalogSnap.data()?.version as number) ?? 1
        : 1;

      // Creating a challenge makes it the active (default) one. Demote the
      // previous default so at most one challenge is ever isDefault.
      const userRef = doc(db, COLLECTIONS.USERS, user.uid);
      const userSnap = await getDoc(userRef);
      const previousDefaultId =
        (userSnap.data() as UserDocument | undefined)?.defaultChallengeId ?? null;

      // The stored pointer can dangle (e.g. the previous default was deleted),
      // so only demote it when the document still exists. A batched update() on
      // a missing doc fails the whole commit with firestore/not-found.
      let previousDefaultRef: FirebaseFirestoreTypes.DocumentReference | null = null;
      if (previousDefaultId) {
        const ref = doc(userRef, SUBCOLLECTIONS.CHALLENGES, previousDefaultId);
        if ((await getDoc(ref)).exists()) {
          previousDefaultRef = ref;
        }
      }

      const batch = writeBatch(db);

      const challengeRef = doc(collection(userRef, SUBCOLLECTIONS.CHALLENGES));
      batch.set(challengeRef, {
        typeId,
        name: t('challenge.defaultName'),
        startDate: serverTimestamp(),
        isDefault: true,
        snapshotEligibleOnsenIds: challengeType.eligibleOnsenIds,
        snapshotCatalogVersion: catalogVersion,
        activeRouteId: null,
        claimedTier: null,
        completedAt: null,
        createdAt: serverTimestamp(),
      });

      if (previousDefaultRef) {
        batch.update(previousDefaultRef, { isDefault: false });
      }

      // set+merge rather than update so creation still succeeds if the user
      // document does not exist yet (e.g. the onUserCreated trigger is lagging).
      batch.set(userRef, { defaultChallengeId: challengeRef.id }, { merge: true });

      await batch.commit();
      router.replace('/');
    } catch (error) {
      Alert.alert(t('challenge.errorCreate'), t(firebaseErrorKey(error)));
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

  const display = localizeChallengeType(typeId, challengeType, t);

  return (
    <>
      <Stack.Screen options={{ title: display.name, headerShown: true }} />
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ChallengeRulesView challengeType={display} />
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
