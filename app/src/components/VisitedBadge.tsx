import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography, radii } from '@/theme';

/**
 * The shared "visited" indicator: an amber disc with a white check, shown at the
 * trailing edge of an onsen row. Used by the Onsens browse tab and the
 * record-a-visit checklist so a visited onsen looks identical in both. Sized to
 * match the unvisited circle on the checklist. Unvisited rows keep each list's own
 * idiom (a chevron on the browse tab, an empty circle on the checklist).
 */
export function VisitedBadge() {
  const { t } = useTranslation();
  // Grouped into one element with a spoken label: the bare glyph would
  // otherwise be announced as "check mark", which says nothing useful.
  return (
    <View accessible accessibilityLabel={t('onsenList.a11yVisited')} style={styles.badge}>
      <Text style={styles.check}>✓</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: spacing[5],
    height: spacing[5],
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
