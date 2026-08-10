import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '@/theme';

const STARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface RatingStarsProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

/** A 1-10 star rating. Tapping the current value clears it back to null. */
export function RatingStars({ value, onChange }: RatingStarsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      {STARS.map((star) => (
        <Pressable
          key={star}
          // The glyph alone reads as ten identical "★"s, so each star carries
          // its own spoken label and selected state.
          accessibilityRole="radio"
          accessibilityLabel={t('onsenDetail.a11yRatingStar', {
            value: star,
            total: STARS.length,
          })}
          accessibilityState={{ selected: star === value }}
          onPress={() => onChange(value === star ? null : star)}
          hitSlop={2}
        >
          <Text style={[styles.star, star <= (value ?? 0) && styles.starFilled]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
    marginBottom: spacing[1],
  },
  star: {
    fontSize: typography.sizes.xl,
    color: colors.backgroundSecondary,
  },
  starFilled: {
    color: colors.actionPrimary,
  },
});
