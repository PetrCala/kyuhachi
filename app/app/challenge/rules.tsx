import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import firestore from '@react-native-firebase/firestore';
import type { ChallengeTypeDocument, TierCondition } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { colors, spacing, typography, radii } from '../../src/theme';

const CHALLENGE_TYPE_ID = 'kyushu-88';

export default function ChallengeRulesScreen() {
  const { t } = useTranslation();
  const [challengeType, setChallengeType] = useState<ChallengeTypeDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = firestore()
      .collection(COLLECTIONS.CHALLENGE_TYPES)
      .doc(CHALLENGE_TYPE_ID)
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
  }, []);

  function renderCondition(condition: TierCondition): string {
    switch (condition.type) {
      case 'minVisits':
        return t('challengeRules.condition.minVisits', { count: condition.value });
      case 'maxFasterVisits':
        if (condition.value === 0) {
          return t('challengeRules.condition.maxFasterVisits.none');
        }
        return t('challengeRules.condition.maxFasterVisits.limit', { count: condition.value });
      case 'maxCalendarDays':
        return t('challengeRules.condition.maxCalendarDays', { count: condition.value });
      default:
        return t('challengeRules.conditionUnknown', {
          type: condition.type,
          value: condition.value,
        });
    }
  }

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
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.heroSection}>
          <Text style={styles.challengeName}>{challengeType.name}</Text>
          <Text style={styles.description}>{challengeType.description}</Text>
        </View>

        {challengeType.rules.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('challengeRules.rulesHeading')}</Text>
            <View style={styles.sectionCard}>
              {challengeType.rules.map((rule, index) => (
                <View
                  key={`${rule}-${index}`}
                  style={[styles.ruleRow, index > 0 && styles.listItemSpacing]}
                >
                  <Text style={styles.listMarker}>-</Text>
                  <Text style={styles.ruleText}>{rule}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {challengeType.tiers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('challengeRules.tiersHeading')}</Text>
            {challengeType.tiers.map((tier) => (
              <View
                key={tier.id}
                style={styles.tierCard}
              >
                <Text style={styles.tierName}>{tier.name}</Text>
                <Text style={styles.tierSummary}>{tier.conditionSummary}</Text>
                {tier.conditions.length > 0 && (
                  <View style={styles.conditionList}>
                    {tier.conditions.map((condition, index) => (
                      <View
                        key={`${tier.id}-${condition.type}-${condition.value}-${index}`}
                        style={[styles.ruleRow, index > 0 && styles.listItemSpacing]}
                      >
                        <Text style={styles.listMarker}>-</Text>
                        <Text style={styles.ruleText}>{renderCondition(condition)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
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
  heroSection: {
    paddingVertical: spacing[2],
  },
  challengeName: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing[3],
  },
  description: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  section: {
    marginTop: spacing[6],
  },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
    marginBottom: spacing[3],
  },
  sectionCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.lg,
    padding: spacing[4],
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  listItemSpacing: {
    marginTop: spacing[3],
  },
  listMarker: {
    width: spacing[4],
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
  },
  ruleText: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  tierCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.lg,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  tierName: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing[2],
  },
  tierSummary: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  conditionList: {
    marginTop: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
});
