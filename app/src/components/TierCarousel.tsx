import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Tier, TierCondition, TransportMode } from '@kyuhachi/shared';
import { ChallengeBadge } from './ChallengeBadge';
import { colors, spacing, typography, radii } from '@/theme';

interface TierCarouselProps {
  /** Ordered best → worst. */
  tiers: Tier[];
  /** The challenge's base transport mode; drawn on each tier badge. */
  transportMode?: TransportMode | null;
  /** Id of the tier the user currently qualifies for; marked as reached. */
  highlightTierId?: string | null;
}

/**
 * Horizontally swipeable tier cards. Each tier keeps an identical layout
 * (badge → summary → condition bullets) so swiping surfaces only the deltas.
 * One page snaps to the carousel's measured width; a dots row tracks position.
 */
export function TierCarousel({
  tiers,
  transportMode = null,
  highlightTierId = null,
}: TierCarouselProps) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  function renderCondition(condition: TierCondition): string {
    switch (condition.type) {
      case 'minVisits':
        return t('challengeRules.condition.minVisits', { count: condition.value });
      case 'maxFasterVisits':
        return condition.value === 0
          ? t('challengeRules.condition.maxFasterVisits.none')
          : t('challengeRules.condition.maxFasterVisits.limit', { count: condition.value });
      case 'maxCalendarDays':
        return t('challengeRules.condition.maxCalendarDays', { count: condition.value });
      default:
        return t('challengeRules.conditionUnknown', {
          type: condition.type,
          value: condition.value,
        });
    }
  }

  function handleLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width <= 0) return;
    setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  if (tiers.length === 0) return null;

  return (
    <View onLayout={handleLayout}>
      {width > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
        >
          {tiers.map((tier) => (
            <View key={tier.id} style={[styles.page, { width }]}>
              <View style={styles.card}>
                <ChallengeBadge
                  tierId={tier.id}
                  transportMode={transportMode}
                  size={80}
                  accessibilityLabel={tier.name}
                />
                <Text style={styles.tierName}>{tier.name}</Text>
                <Text style={styles.summary}>{tier.conditionSummary}</Text>
                {tier.conditions.length > 0 && (
                  <View style={styles.conditionList}>
                    {tier.conditions.map((condition, index) => (
                      <View
                        key={`${tier.id}-${condition.type}-${index}`}
                        style={[styles.conditionRow, index > 0 && styles.conditionSpacing]}
                      >
                        <Text style={styles.marker}>・</Text>
                        <Text style={styles.conditionText}>{renderCondition(condition)}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {highlightTierId === tier.id && (
                  <Text style={styles.reachedBadge}>{t('challengeProgress.tierEligible')}</Text>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      {tiers.length > 1 && (
        <View style={styles.dots}>
          {tiers.map((tier, index) => (
            <View
              key={tier.id}
              style={[styles.dot, index === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    // Full carousel width; the inner card supplies the inset.
  },
  card: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.lg,
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[4],
    marginHorizontal: spacing[2],
    alignItems: 'center',
  },
  tierName: {
    marginTop: spacing[3],
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  summary: {
    marginTop: spacing[2],
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  conditionList: {
    alignSelf: 'stretch',
    marginTop: spacing[5],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  conditionSpacing: {
    marginTop: spacing[2],
  },
  marker: {
    width: spacing[4],
    fontSize: typography.sizes.md,
    color: colors.textMuted,
  },
  conditionText: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  reachedBadge: {
    marginTop: spacing[4],
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimary,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing[4],
    gap: spacing[2],
  },
  dot: {
    width: spacing[2],
    height: spacing[2],
    borderRadius: radii.full,
    backgroundColor: colors.separator,
  },
  dotActive: {
    backgroundColor: colors.textSecondary,
  },
});
