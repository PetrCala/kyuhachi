import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAreaGuides } from '@/context/AreaGuideContext';
import { AreaGuideView } from '@/components/AreaGuideView';
import { pickLocalized } from '@/lib/area-guide';
import { colors, spacing, typography } from '@/theme';

/**
 * A single region's area guide, opened by areaId (from an onsen's "About this
 * area" row). Served offline from the AreaGuideContext cache.
 */
export default function AreaGuideScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { guideMap, loading } = useAreaGuides();
  const guide = id ? (guideMap.get(id) ?? null) : null;

  if (loading && !guide) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true }} />
        <ActivityIndicator style={styles.centered} />
      </>
    );
  }

  if (!guide) {
    return (
      <>
        <Stack.Screen options={{ title: t('areaGuide.title'), headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('areaGuide.notFound')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{ title: pickLocalized(guide.name, i18n.language), headerShown: true }}
      />
      <AreaGuideView guide={guide} />
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing[6],
  },
  emptyText: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
