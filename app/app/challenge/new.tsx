import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import firestore from '@react-native-firebase/firestore';
import type { ChallengeTypeDocument } from '@kyuhachi/shared';
import { COLLECTIONS, TRANSPORT_MODES } from '@kyuhachi/shared';
import { TierBadge } from '../../src/components/TierBadge';
import { colors, spacing, typography, radii } from '../../src/theme';

interface ChallengeTypeRow {
  id: string;
  type: ChallengeTypeDocument;
}

export default function ChooseChallengeType() {
  const { t } = useTranslation();
  const [types, setTypes] = useState<ChallengeTypeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = firestore()
      .collection(COLLECTIONS.CHALLENGE_TYPES)
      .where('isActive', '==', true)
      .onSnapshot(
        (snap) => {
          const rows = snap.docs.map((doc) => ({
            id: doc.id,
            type: doc.data() as ChallengeTypeDocument,
          }));
          // Easiest first: a higher baseMode rank means a more permissive
          // challenge (car > public > bicycle > foot).
          rows.sort(
            (a, b) =>
              TRANSPORT_MODES.indexOf(b.type.baseMode) -
              TRANSPORT_MODES.indexOf(a.type.baseMode)
          );
          setTypes(rows);
          setLoading(false);
        },
        () => setLoading(false)
      );
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('challengeNew.title'), headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </>
    );
  }

  if (types.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: t('challengeNew.title'), headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('challenge.errorLoad')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('challengeNew.title'), headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{t('challengeNew.heading')}</Text>
        <Text style={styles.hint}>{t('challengeNew.hint')}</Text>

        {types.map(({ id, type }) => (
          <Pressable
            key={id}
            style={styles.card}
            onPress={() => router.push({ pathname: '/challenge/preview', params: { typeId: id } })}
          >
            <View style={styles.cardText}>
              <Text style={styles.cardName}>{type.name}</Text>
              <Text style={styles.cardDescription} numberOfLines={2}>
                {type.description}
              </Text>
            </View>
            <View style={styles.tierDots}>
              {type.tiers.map((tier) => (
                <TierBadge key={tier.id} tierId={tier.id} size={spacing[3]} />
              ))}
            </View>
          </Pressable>
        ))}
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
  heading: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing[2],
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
  cardText: {
    flex: 1,
    marginRight: spacing[3],
  },
  cardName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  cardDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },
  tierDots: {
    flexDirection: 'row',
    gap: spacing[1],
  },
});
