import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
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
  getDocs,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { ChallengeDocument, ChallengeTypeDocument, UserDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS, CATALOG_META_DOC_ID } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import { ChallengeRulesView } from '@/components/ChallengeRulesView';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import { challengeTypeName, localizeChallengeType } from '@/lib/challenge-i18n';
import { uniqueChallengeName } from '@/lib/challenge-name';
import { colors, spacing, typography, radii } from '@/theme';

/** Cap a custom challenge name so it stays readable in the list/switcher. */
const NAME_MAX_LENGTH = 60;

export default function ChallengePreview() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { typeId } = useLocalSearchParams<{ typeId: string }>();
  const [challengeType, setChallengeType] = useState<ChallengeTypeDocument | null>(null);
  const [name, setName] = useState('');
  const [existingNames, setExistingNames] = useState<string[]>([]);
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

  // Existing names disambiguate the auto-generated default (e.g. a second
  // "Walking Challenge" becomes "Walking Challenge 2"). A one-shot read is
  // enough — the set only needs to be current when this screen creates.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getDocs(collection(doc(db, COLLECTIONS.USERS, user.uid), SUBCOLLECTIONS.CHALLENGES))
      .then((snap: FirebaseFirestoreTypes.QuerySnapshot) => {
        if (cancelled) return;
        setExistingNames(snap.docs.map((d) => (d.data() as ChallengeDocument).name ?? ''));
      })
      .catch(() => {
        // Non-fatal: without the set we just skip disambiguation.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // The name written when the field is left blank, shown as the input's
  // placeholder so the user sees exactly what they'll get.
  const autoName = useMemo(() => {
    if (!challengeType) return '';
    return uniqueChallengeName(challengeTypeName(typeId, challengeType.name, t), existingNames);
  }, [challengeType, typeId, existingNames, t]);

  async function handleCreate() {
    if (!user || !typeId || !challengeType) return;

    // The eligible pool is frozen onto the challenge at creation. If the type
    // document is missing it (e.g. seeded before the onsen catalog was
    // published), writing `undefined` throws a cryptic, codeless Firestore error
    // — surfaced only as the generic "something went wrong" alert — and an empty
    // pool would create an uncompletable 0/88 challenge. Fail clearly instead.
    const eligibleOnsenIds = challengeType.eligibleOnsenIds;
    if (!Array.isArray(eligibleOnsenIds) || eligibleOnsenIds.length === 0) {
      Alert.alert(t('challenge.errorCreate'), t('challenge.errorNoEligibleOnsens'));
      return;
    }

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
        // Build from `db`, not `userRef`: RN Firebase's modular doc() resolves a
        // DocumentReference parent via `parent.doc(...)`, but DocumentReference
        // has no `.doc` method (only `.collection`), so doc(userRef, ...) throws
        // "Cannot read property 'call' of undefined".
        const ref = doc(
          db,
          COLLECTIONS.USERS,
          user.uid,
          SUBCOLLECTIONS.CHALLENGES,
          previousDefaultId
        );
        if ((await getDoc(ref)).exists()) {
          previousDefaultRef = ref;
        }
      }

      const batch = writeBatch(db);

      const challengeRef = doc(collection(userRef, SUBCOLLECTIONS.CHALLENGES));
      batch.set(challengeRef, {
        typeId,
        name: name.trim() || autoName,
        startDate: serverTimestamp(),
        isDefault: true,
        snapshotEligibleOnsenIds: eligibleOnsenIds,
        snapshotCatalogVersion: catalogVersion,
        activeRouteId: null,
        earnedTier: null,
        earnedTierAt: null,
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
      // firebaseErrorKey collapses unrecognized codes (and codeless errors) into
      // a generic message, so log the real error in dev to keep create failures
      // diagnosable.
      if (__DEV__) console.warn('[challenge] create failed', error);
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.nameField}>
            <Text style={styles.nameLabel}>{t('challenge.nameLabel')}</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder={autoName}
              placeholderTextColor={colors.textPlaceholder}
              maxLength={NAME_MAX_LENGTH}
              returnKeyType="done"
              editable={!creating}
            />
          </View>
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
  nameField: {
    marginBottom: spacing[5],
  },
  nameLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginBottom: spacing[2],
  },
  nameInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundElevated,
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
