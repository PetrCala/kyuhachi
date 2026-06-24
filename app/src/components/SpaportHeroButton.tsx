import { Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography, radii } from '@/theme';

/**
 * Compact Spaport entry point for the progress hero's top-right corner — a small
 * text pill, level with the X / 88 headline, that opens the full passport. The
 * label is the Spaport name itself ("Spaport" / 御湯印帳), so it reads as a
 * wordmark-style shortcut rather than a generic button.
 */
export function SpaportHeroButton() {
  const { t } = useTranslation();
  return (
    <Pressable style={styles.button} onPress={() => router.push('/passport')} accessibilityRole="button">
      <Text style={styles.label}>{t('passport.title')}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.full,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  chevron: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
  },
});
