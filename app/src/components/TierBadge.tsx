import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../theme';

const TIER_COLORS: Record<string, string> = {
  gold: colors.tierGold,
  silver: colors.tierSilver,
  bronze: colors.tierBronze,
};

function tierColor(tierId: string): string {
  return TIER_COLORS[tierId] ?? colors.textMuted;
}

interface TierBadgeProps {
  tierId: string;
  /** Display label (e.g. 金 / 銀 / 銅). Omit for a plain colored dot. */
  name?: string;
  /** Diameter in points. */
  size?: number;
}

/**
 * A circular tier emblem: a colored ring with the tier label centered inside.
 * Used both as a large badge in the tier carousel and as a small teaser dot
 * (pass no `name`) in the challenge-type picker.
 */
export function TierBadge({ tierId, name, size = 64 }: TierBadgeProps) {
  const color = tierColor(tierId);
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, borderColor: color },
      ]}
    >
      {name ? <Text style={[styles.label, { color }]}>{name}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.semibold,
  },
});
