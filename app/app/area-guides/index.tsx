import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { CachedAreaGuide } from '@kyuhachi/shared';
import { useAreaGuides } from '@/context/AreaGuideContext';
import { useOnsenCatalog } from '@/context/OnsenCatalogContext';
import { useUserLocation } from '@/hooks/useUserLocation';
import { nearestAreaGuide, pickLocalized, sortAreaGuidesByName } from '@/lib/area-guide';
import { simulatedCoordinate } from '@/lib/dev-location';
import type { LatLng } from '@/lib/geo';
import { colors, spacing, typography, radii } from '@/theme';

/**
 * Browse all area guides. The whole published set is already on the device
 * (AreaGuideContext), so this is a pure list: every region sorted by name, with
 * a "your area" shortcut card pinned on top when a location fix is available.
 * Each entry opens the region's guide via the by-id route.
 */
export default function AreaGuidesScreen() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { guides, loading } = useAreaGuides();
  const { activeOnsens } = useOnsenCatalog();
  // Dev builds stand in a simulated Kyushu location; real builds ask once.
  const deviceCoords = useUserLocation(!__DEV__);

  const coords = useMemo<LatLng | null>(() => {
    if (__DEV__) {
      const c = simulatedCoordinate(
        null,
        activeOnsens.map((o) => ({ lat: o.lat, lng: o.lng }))
      );
      return { lat: c.latitude, lng: c.longitude };
    }
    return deviceCoords;
  }, [deviceCoords, activeOnsens]);

  const nearest = useMemo(
    () => (coords ? nearestAreaGuide(coords, guides) : null),
    [coords, guides]
  );
  const sorted = useMemo(() => sortAreaGuidesByName(guides, language), [guides, language]);

  const header = (
    <Stack.Screen options={{ title: t('areaGuide.browseTitle'), headerShown: true }} />
  );

  if (loading && guides.length === 0) {
    return (
      <>
        {header}
        <ActivityIndicator testID="area-loading" style={styles.centered} />
      </>
    );
  }

  if (guides.length === 0) {
    return (
      <>
        {header}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('areaGuide.empty')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {nearest && (
          <>
            <Text style={styles.sectionHeader}>{t('areaGuide.yourArea')}</Text>
            <View style={styles.group}>
              <Pressable
                testID="area-your-area"
                style={styles.card}
                onPress={() => router.push(`/area-guides/${nearest.id}`)}
                accessibilityRole="button"
                accessibilityLabel={pickLocalized(nearest.name, language)}
              >
                <View style={styles.cardIcon}>
                  <Ionicons
                    name="location"
                    size={typography.sizes.xl}
                    color={colors.actionPrimary}
                  />
                </View>
                <View style={styles.cardMain}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {pickLocalized(nearest.name, language)}
                  </Text>
                  {nearest.tagline && (
                    <Text style={styles.cardSubtitle} numberOfLines={1}>
                      {pickLocalized(nearest.tagline, language)}
                    </Text>
                  )}
                </View>
                <Text style={styles.cardTeaser}>{t('areaGuide.nearYou')}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={typography.sizes.lg}
                  color={colors.textPlaceholder}
                />
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.sectionHeader}>{t('areaGuide.allRegions')}</Text>
        <View style={styles.group}>
          {sorted.map((guide, i) => (
            <RegionRow
              key={guide.id}
              guide={guide}
              language={language}
              last={i === sorted.length - 1}
            />
          ))}
        </View>
      </ScrollView>
    </>
  );
}

function RegionRow({
  guide,
  language,
  last,
}: {
  guide: CachedAreaGuide;
  language: string;
  last: boolean;
}) {
  const name = pickLocalized(guide.name, language);
  const tagline = guide.tagline ? pickLocalized(guide.tagline, language) : null;

  return (
    <Pressable
      testID={`area-region-${guide.id}`}
      style={[styles.row, last && styles.rowLast]}
      onPress={() => router.push(`/area-guides/${guide.id}`)}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowName} numberOfLines={1}>
          {name}
        </Text>
        {tagline && (
          <Text style={styles.rowTagline} numberOfLines={1}>
            {tagline}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={typography.sizes.lg} color={colors.textPlaceholder} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  content: {
    padding: spacing[4],
    paddingBottom: spacing[10],
  },
  sectionHeader: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[6],
    marginBottom: spacing[2],
    marginLeft: spacing[4],
  },
  group: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  cardIcon: {
    width: spacing[10],
    height: spacing[10],
    borderRadius: radii.full,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  cardMain: {
    flex: 1,
  },
  cardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    marginTop: spacing[1],
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  cardTeaser: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginRight: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowMain: {
    flex: 1,
    marginRight: spacing[2],
  },
  rowName: {
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
  },
  rowTagline: {
    marginTop: spacing[1],
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
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
