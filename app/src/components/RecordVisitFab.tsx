import { Pressable, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OnsenIcon from './OnsenIcon';
import { colors, radii, spacing, shadows } from '@/theme';

// Fixed FAB geometry: dimensions and rim-anchored badge offset, not part of the
// spacing scale. The negative offset nudges the badge onto the circle's edge so
// it overhangs the top-right corner like a notification badge.
const FAB_SIZE = 56;
const GLYPH_SIZE = 28;
const BADGE_SIZE = 22;
const BADGE_ICON_SIZE = 14;
const BADGE_OFFSET = -3;

interface RecordVisitFabProps {
  onPress: () => void;
  /** Spoken label; there is no visible text on the button. */
  accessibilityLabel: string;
  /** Positioning supplied by the host screen (absolute placement). */
  style?: StyleProp<ViewStyle>;
}

/**
 * Floating action button for recording an onsen visit. The hot-spring glyph (♨)
 * says "onsen"; the amber "+" badge says "add". No text: the icon pair carries
 * the meaning. The host screen owns placement via `style`.
 */
export default function RecordVisitFab({ onPress, accessibilityLabel, style }: RecordVisitFabProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={spacing[2]}
      style={({ pressed }) => [styles.fab, shadows.lg, style, pressed && styles.fabPressed]}
    >
      <OnsenIcon color={colors.actionPrimaryText} size={GLYPH_SIZE} />
      <View style={styles.badge}>
        <Ionicons name="add" size={BADGE_ICON_SIZE} color={colors.brand} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.actionPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressed: {
    opacity: 0.85,
  },
  badge: {
    position: 'absolute',
    top: BADGE_OFFSET,
    right: BADGE_OFFSET,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.brandGlyph,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.actionPrimary,
  },
});
