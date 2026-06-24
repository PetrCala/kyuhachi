import { Pressable, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, shadows } from '@/theme';

// Mirrors RecordVisitFab's geometry so the button keeps its exact place and size
// when an onsen flips from unvisited to visited — only the meaning changes.
const FAB_SIZE = 56;
const GLYPH_SIZE = 30;
const BADGE_SIZE = 22;
const BADGE_ICON_SIZE = 13;
const BADGE_OFFSET = -3;

interface VisitedFabProps {
  onPress: () => void;
  /** Spoken label — there is no visible text on the button. */
  accessibilityLabel: string;
  /** Positioning supplied by the host screen (absolute placement). */
  style?: StyleProp<ViewStyle>;
}

/**
 * The visited-state counterpart to RecordVisitFab. It occupies the same bottom-right
 * slot, so the action button never disappears — it simply changes from "add" (black
 * circle, amber +) to "done" (bath-water-blue circle, white check) with a pencil badge
 * that says "tap to edit your visit".
 */
export default function VisitedFab({ onPress, accessibilityLabel, style }: VisitedFabProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={spacing[2]}
      style={({ pressed }) => [styles.fab, shadows.lg, style, pressed && styles.fabPressed]}
    >
      <Ionicons name="checkmark-sharp" size={GLYPH_SIZE} color={colors.textInverted} />
      <View style={styles.badge}>
        <Ionicons name="pencil" size={BADGE_ICON_SIZE} color={colors.onsenVisited} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.onsenVisited,
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
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.onsenVisited,
  },
});
