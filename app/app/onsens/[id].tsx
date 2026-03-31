import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import firestore from '@react-native-firebase/firestore';
import type { OnsenDocument, UserDocument } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography, radii } from '../../src/theme';

type OnsenWithId = OnsenDocument & { id: string };

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function OnsenDetail() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [onsen, setOnsen] = useState<OnsenWithId | null>(null);
  const [loading, setLoading] = useState(true);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [isVisited, setIsVisited] = useState(false);
  const [marking, setMarking] = useState(false);

  // Listen to onsen document
  useEffect(() => {
    if (!id) return;
    const unsubscribe = firestore()
      .collection(COLLECTIONS.ONSENS)
      .doc(id)
      .onSnapshot(
        (doc) => {
          setOnsen(doc.exists() ? { id: doc.id, ...(doc.data() as OnsenDocument) } : null);
          setLoading(false);
        },
        () => {
          setOnsen(null);
          setLoading(false);
        }
      );
    return unsubscribe;
  }, [id]);

  // Listen to user's default challenge and visit state
  useEffect(() => {
    if (!user || !id) return;

    let unsubVisit: (() => void) | null = null;

    const unsubUser = firestore()
      .collection(COLLECTIONS.USERS)
      .doc(user.uid)
      .onSnapshot((doc) => {
        const data = doc.data() as UserDocument | undefined;
        const defChallengeId = data?.defaultChallengeId ?? null;
        setChallengeId(defChallengeId);

        unsubVisit?.();
        unsubVisit = null;

        if (!defChallengeId) {
          setIsVisited(false);
          return;
        }

        unsubVisit = firestore()
          .collection(COLLECTIONS.USERS)
          .doc(user.uid)
          .collection(SUBCOLLECTIONS.CHALLENGES)
          .doc(defChallengeId)
          .collection(SUBCOLLECTIONS.VISITS)
          .doc(id)
          .onSnapshot((visitDoc) => {
            setIsVisited(visitDoc.exists());
          });
      });

    return () => {
      unsubVisit?.();
      unsubUser();
    };
  }, [user, id]);

  async function handleMarkVisited() {
    if (!user || !challengeId || !id) return;
    setMarking(true);
    try {
      await firestore()
        .collection(COLLECTIONS.USERS)
        .doc(user.uid)
        .collection(SUBCOLLECTIONS.CHALLENGES)
        .doc(challengeId)
        .collection(SUBCOLLECTIONS.VISITS)
        .doc(id)
        .set({
          visitedAt: firestore.FieldValue.serverTimestamp(),
          notes: null,
          photoUrl: null,
          structuredData: {
            rating: null,
            waterTemp: null,
            duration: null,
            transportUsed: null,
          },
          createdAt: firestore.FieldValue.serverTimestamp(),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : '');
    } finally {
      setMarking(false);
    }
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true }} />
        <ActivityIndicator style={styles.centered} />
      </>
    );
  }

  if (!onsen) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('onsenDetail.notFound')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: onsen.name, headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {onsen.imageUrl && (
          <Image
            source={{ uri: onsen.imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        )}

        <View style={styles.header}>
          <Text style={styles.name}>{onsen.name}</Text>
          <Text style={styles.area}>
            {onsen.areaName}　{onsen.prefecture}
          </Text>
          {!onsen.isActive && (
            <View style={styles.archivedBadge}>
              <Text style={styles.archivedText}>{t('onsenDetail.archived')}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <InfoRow label={t('onsenDetail.labelAddress')} value={onsen.address} />
          {onsen.phone && <InfoRow label={t('onsenDetail.labelPhone')} value={onsen.phone} />}
          {onsen.admissionFee && <InfoRow label={t('onsenDetail.labelFee')} value={onsen.admissionFee} />}
          {onsen.springQuality && <InfoRow label={t('onsenDetail.labelSpringQuality')} value={onsen.springQuality} />}
          {onsen.businessHours && (
            <InfoRow label={t('onsenDetail.labelHours')} value={onsen.businessHours.raw} />
          )}
        </View>

        {onsen.websiteUrl && (
          <View style={styles.section}>
            <Pressable onPress={() => Linking.openURL(onsen.websiteUrl!)}>
              <Text style={styles.websiteLink}>{onsen.websiteUrl}</Text>
            </Pressable>
          </View>
        )}

        {challengeId && (
          <View style={styles.visitSection}>
            {isVisited ? (
              <View style={styles.visitedBadge}>
                <Text style={styles.visitedText}>{t('onsenDetail.visited')}</Text>
              </View>
            ) : (
              <Pressable
                style={[styles.visitButton, marking && styles.visitButtonDisabled]}
                onPress={handleMarkVisited}
                disabled={marking}
              >
                <Text style={styles.visitButtonText}>{t('onsenDetail.markVisited')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing[10],
  },
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
  image: {
    width: '100%',
    height: 220,
    backgroundColor: colors.backgroundSecondary,
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  name: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  area: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  archivedBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing[2],
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.sm,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  archivedText: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
  },
  section: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    paddingBottom: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: spacing[2],
  },
  infoLabel: {
    width: 80,
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  websiteLink: {
    fontSize: typography.sizes.sm,
    color: colors.actionPrimary,
    textDecorationLine: 'underline',
    paddingVertical: spacing[2],
  },
  visitSection: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[6],
    alignItems: 'center',
  },
  visitButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[4],
  },
  visitButtonDisabled: {
    opacity: 0.4,
  },
  visitButtonText: {
    color: colors.actionPrimaryText,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  visitedBadge: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
  },
  visitedText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textTertiary,
  },
});
