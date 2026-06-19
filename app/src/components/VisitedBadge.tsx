import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii } from '@/theme';

/**
 * The shared "visited" indicator: an amber disc with a white check, shown at the
 * trailing edge of an onsen row. Used by the Onsens browse tab and the
 * record-a-visit checklist so a visited onsen looks identical in both. Unvisited
 * rows keep each list's own idiom (a chevron on the browse tab, ○ on the checklist).
 */
export function VisitedBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.check}>✓</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: spacing[6],
    height: spacing[6],
    borderRadius: radii.full,
    backgroundColor: colors.brandGlyph,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing[2],
  },
  check: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textInverted,
  },
});
