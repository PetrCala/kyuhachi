import { useMemo } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAreaGuides } from '@/context/AreaGuideContext';
import { useOnsenCatalog } from '@/context/OnsenCatalogContext';
import { useUserLocation } from '@/hooks/useUserLocation';
import { AreaGuideView } from '@/components/AreaGuideView';
import { nearestAreaGuide } from '@/lib/area-guide';
import { simulatedCoordinate } from '@/lib/dev-location';
import type { LatLng } from '@/lib/geo';
import { colors, spacing, typography } from '@/theme';

/**
 * "Your area": the guide for the region nearest the user, resolved offline from
 * each region's centre. Dev builds stand in a simulated Kyushu location; real
 * builds ask for a one-shot fix. No polygons, no reverse-geocoding.
 */
export default function NearbyAreaGuideScreen() {
  const { t } = useTranslation();
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

  const guide = useMemo(
    () => (coords ? nearestAreaGuide(coords, guides) : null),
    [coords, guides]
  );

  const header = <Stack.Screen options={{ title: t('areaGuide.yourArea'), headerShown: true }} />;

  if (loading && guides.length === 0) {
    return (
      <>
        {header}
        <ActivityIndicator style={styles.centered} />
      </>
    );
  }

  if (!coords) {
    return (
      <>
        {header}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('areaGuide.noLocation')}</Text>
        </View>
      </>
    );
  }

  if (!guide) {
    return (
      <>
        {header}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('areaGuide.notFound')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      {header}
      <AreaGuideView guide={guide} locatedNote={t('areaGuide.detectedNearby')} />
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
