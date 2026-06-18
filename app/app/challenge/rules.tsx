import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import firestore from '@react-native-firebase/firestore';
import type { ChallengeTypeDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { ChallengeRulesView } from '../../src/components/ChallengeRulesView';
import { colors, spacing, typography } from '../../src/theme';

export default function ChallengeRulesScreen() {
  const { t } = useTranslation();
  const { typeId } = useLocalSearchParams<{ typeId?: string }>();
  const [challengeType, setChallengeType] = useState<ChallengeTypeDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!typeId) {
      setChallengeType(null);
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
        () => {
          setChallengeType(null);
          setLoading(false);
        }
      );

    return unsubscribe;
  }, [typeId]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('challengeRules.title'), headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </>
    );
  }

  if (!challengeType) {
    return (
      <>
        <Stack.Screen options={{ title: t('challengeRules.title'), headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('challenge.errorLoad')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('challengeRules.title'), headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <ChallengeRulesView challengeType={challengeType} />
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
});
