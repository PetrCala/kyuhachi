import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAreaGuides } from '@/context/AreaGuideContext';
import { pickLocalized } from '@/lib/area-guide';
import { colors, spacing, typography } from '@/theme';

/**
 * The onsen-detail entry into the area guide: a deliberately quiet row (styled
 * like the Hours/Admission rows next to it, not a featured card) showing the
 * region name and opening its guide. Renders nothing when the onsen has no
 * areaId or its guide hasn't loaded, so it never leaves a dead row behind.
 */
export function AreaGuideRow({ areaId }: { areaId: string | null }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { guideMap } = useAreaGuides();

  if (!areaId) return null;
  const guide = guideMap.get(areaId);
  if (!guide) return null;

  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push(`/area-guides/${areaId}`)}
      accessibilityRole="button"
      accessibilityLabel={t('areaGuide.aboutThisArea')}
    >
      <Text style={styles.label}>{t('areaGuide.aboutThisArea')}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {pickLocalized(guide.name, i18n.language)}
      </Text>
      <Ionicons
        name="chevron-forward"
        size={typography.sizes.md}
        color={colors.textPlaceholder}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  label: {
    width: spacing[12] + spacing[8],
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  value: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
});
