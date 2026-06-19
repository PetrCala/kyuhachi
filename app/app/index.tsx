import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { signOut } from '@react-native-firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { UserDocument, ChallengeDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '../src/context/AuthContext';
import { db, auth } from '../src/firebase';
import { colors, spacing, typography, radii } from '../src/theme';

// Brand wordmark: 九八 (kyuhachi) set in Klee One. Not a translatable string —
// it's the app's visual identity and renders identically in every locale.
const HOME_WORDMARK = '九八';

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [challengeName, setChallengeName] = useState<string | null>(null);
  const [visitCount, setVisitCount] = useState(0);
  const [completionCount, setCompletionCount] = useState(88);
  const [hasChallenge, setHasChallenge] = useState<boolean | null>(null);

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
        const challengeId = data?.defaultChallengeId ?? null;

        cleanupInner();

        if (!challengeId) {
          setHasChallenge(false);
          setChallengeName(null);
          setVisitCount(0);
          return;
        }

        setHasChallenge(true);

        unsubChallenge = onSnapshot(
          doc(db, COLLECTIONS.USERS, user.uid, SUBCOLLECTIONS.CHALLENGES, challengeId),
          (challengeDoc: FirebaseFirestoreTypes.DocumentSnapshot) => {
            if (!challengeDoc.exists()) {
              setChallengeName(null);
              setVisitCount(0);
              return;
            }

            const challenge = challengeDoc.data() as ChallengeDocument;
            setChallengeName(challenge.name);
            setCompletionCount(
              challenge.snapshotEligibleOnsenIds.length >= 88
                ? 88
                : challenge.snapshotEligibleOnsenIds.length
            );

            unsubVisits?.();
            unsubVisits = onSnapshot(
              collection(
                db,
                COLLECTIONS.USERS,
                user.uid,
                SUBCOLLECTIONS.CHALLENGES,
                challengeId,
                SUBCOLLECTIONS.VISITS
              ),
              (visitsSnap: FirebaseFirestoreTypes.QuerySnapshot) => {
                const eligibleSet = new Set(challenge.snapshotEligibleOnsenIds);
                const eligible = visitsSnap.docs.filter((d) => eligibleSet.has(d.id));
                setVisitCount(eligible.length);
              },
              (error) => {
                console.error('Failed to subscribe to challenge visits', error);
                setVisitCount(0);
              }
            );
          },
          (error) => {
            console.error('Failed to subscribe to default challenge', error);
            setChallengeName(null);
            setVisitCount(0);
            setHasChallenge(null);
          }
        );
      },
      (error) => {
        console.error('Failed to subscribe to user profile', error);
        cleanupInner();
        setHasChallenge(null);
        setChallengeName(null);
        setVisitCount(0);
      }
    );

    return () => {
      cleanupInner();
      unsubUser();
    };
  }, [user]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{HOME_WORDMARK}</Text>
      <Text style={styles.subtitle}>{user?.email ?? user?.displayName ?? ''}</Text>

      {hasChallenge === true && (
        <Pressable
          style={styles.challengeSection}
          onPress={() => router.push('/challenge')}
        >
          <Text style={styles.challengeName}>{challengeName}</Text>
          <Text style={styles.progress}>
            {t('home.progress', { visited: visitCount, total: completionCount })}
          </Text>
        </Pressable>
      )}

      {hasChallenge === false && (
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push('/challenge/new')}
        >
          <Text style={styles.primaryButtonText}>{t('home.startChallenge')}</Text>
        </Pressable>
      )}

      <Pressable style={styles.primaryButton} onPress={() => router.push('/onsens')}>
        <Text style={styles.primaryButtonText}>{t('home.onsenList')}</Text>
      </Pressable>
      <Pressable style={styles.primaryButton} onPress={() => router.push('/map')}>
        <Text style={styles.primaryButtonText}>{t('home.map')}</Text>
      </Pressable>
      <Pressable style={styles.primaryButton} onPress={() => router.push('/routes')}>
        <Text style={styles.primaryButtonText}>{t('home.routes')}</Text>
      </Pressable>
      <Pressable style={styles.signOut} onPress={() => signOut(auth)}>
        <Text style={styles.signOutText}>{t('home.signOut')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing[6],
  },
  title: {
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.xxxl,
    color: colors.textPrimary,
    marginBottom: spacing[2],
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing[6],
  },
  challengeSection: {
    alignItems: 'center',
    marginBottom: spacing[8],
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
  primaryButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    marginBottom: spacing[3],
  },
  primaryButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
  },
  signOut: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
    marginTop: spacing[4],
  },
  signOutText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
});
