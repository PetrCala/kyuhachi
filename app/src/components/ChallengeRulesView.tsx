import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ChallengeTypeDocument } from '@kyuhachi/shared';
import { TierCarousel } from './TierCarousel';
import { colors, spacing, typography, radii } from '../theme';

interface ChallengeRulesViewProps {
  challengeType: ChallengeTypeDocument;
  /** Id of the tier the user currently qualifies for (challenge progress only). */
  highlightTierId?: string | null;
}

/**
 * The shared "what this challenge is" body: hero (name + description), the
 * swipeable tier carousel, then the prose rules. Used by the create-flow
 * preview and the standalone rules screen so both render identically.
 */
export function ChallengeRulesView({
  challengeType,
  highlightTierId = null,
}: ChallengeRulesViewProps) {
  const { t } = useTranslation();

  return (
    <View>
      <View style={styles.hero}>
        <Text style={styles.name}>{challengeType.name}</Text>
        <Text style={styles.description}>{challengeType.description}</Text>
      </View>

      {challengeType.tiers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('challengeRules.tiersHeading')}</Text>
          <TierCarousel tiers={challengeType.tiers} highlightTierId={highlightTierId} />
        </View>
      )}

      {challengeType.rules.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('challengeRules.rulesHeading')}</Text>
          <View style={styles.rulesCard}>
            {challengeType.rules.map((rule, index) => (
              <View
                key={`${rule}-${index}`}
                style={[styles.ruleRow, index > 0 && styles.ruleSpacing]}
              >
                <Text style={styles.marker}>・</Text>
                <Text style={styles.ruleText}>{rule}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingVertical: spacing[2],
  },
  name: {
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
  rulesCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.lg,
    padding: spacing[4],
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  ruleSpacing: {
    marginTop: spacing[3],
  },
  marker: {
    width: spacing[4],
    fontSize: typography.sizes.md,
    color: colors.textMuted,
  },
  ruleText: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    lineHeight: 24,
  },
});
