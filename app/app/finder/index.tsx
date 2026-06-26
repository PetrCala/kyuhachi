import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { POI_CATEGORIES, type PoiCategory } from '@kyuhachi/shared';
import { usePreferences } from '@/context/PreferencesContext';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { useUserLocation } from '@/hooks/useUserLocation';
import { simulatedCoordinate } from '@/lib/dev-location';
import type { LatLng } from '@/lib/geo';
import {
  corridorTileCenters,
  orderAlongRoute,
  orderNearMe,
  userAlongRouteKm,
  type FinderResult,
} from '@/lib/finder';
import { searchPois } from '@/lib/poi-provider';
import { colors, spacing, typography, radii, shadows } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const CATEGORY_META: Record<PoiCategory, { icon: IconName; labelKey: string }> = {
  convenience_store: { icon: 'storefront-outline', labelKey: 'finder.categoryConvenienceStore' },
  supermarket: { icon: 'cart-outline', labelKey: 'finder.categorySupermarket' },
  hotel: { icon: 'bed-outline', labelKey: 'finder.categoryHotel' },
  campsite: { icon: 'bonfire-outline', labelKey: 'finder.categoryCampsite' },
  michi_no_eki: { icon: 'trail-sign-outline', labelKey: 'finder.categoryMichiNoEki' },
};

function round1(km: number): number {
  return Math.round(km * 10) / 10;
}

export default function FinderScreen() {
  const { t } = useTranslation();
  const { finderCorridorKm, finderLookAheadKm, loaded } = usePreferences();
  const { activeRoute } = useActiveChallengeProgress();
  // Dev builds stand in a simulated Kyushu location; real builds ask once.
  const deviceCoords = useUserLocation(!__DEV__);

  const coords = useMemo<LatLng | null>(() => {
    if (__DEV__) {
      const c = simulatedCoordinate(activeRoute, []);
      return { lat: c.latitude, lng: c.longitude };
    }
    return deviceCoords;
  }, [activeRoute, deviceCoords]);

  const route =
    activeRoute && activeRoute.points.length >= 2 ? activeRoute.points : null;

  const [category, setCategory] = useState<PoiCategory>(POI_CATEGORIES[0]);
  const [reversed, setReversed] = useState(false);
  const [results, setResults] = useState<FinderResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!coords || !loaded) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    (async () => {
      try {
        let next: FinderResult[];
        if (route) {
          const userAlongKm = userAlongRouteKm(coords, route, reversed);
          const { centers, radiusKm } = corridorTileCenters({
            route,
            userAlongKm,
            lookAheadKm: finderLookAheadKm,
            corridorKm: finderCorridorKm,
            reversed,
          });
          const pois = await searchPois(category, centers, radiusKm);
          next = orderAlongRoute({
            user: coords,
            route,
            pois,
            corridorKm: finderCorridorKm,
            lookAheadKm: finderLookAheadKm,
            reversed,
          });
        } else {
          const radiusKm = Math.min(finderLookAheadKm, 50);
          const pois = await searchPois(category, [coords], radiusKm);
          next = orderNearMe({ user: coords, pois, radiusKm });
        }
        if (!cancelled) setResults(next);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coords, route, category, reversed, finderCorridorKm, finderLookAheadKm, loaded]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('finder.title'), headerShown: true }} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        {POI_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            category={c}
            active={c === category}
            onPress={() => setCategory(c)}
          />
        ))}
      </ScrollView>

      {route ? (
        <Pressable
          onPress={() => setReversed((prev) => !prev)}
          accessibilityRole="button"
          accessibilityState={{ selected: reversed }}
          style={styles.reverseRow}
        >
          <Ionicons
            name="swap-horizontal"
            size={18}
            color={reversed ? colors.actionPrimary : colors.textMuted}
          />
          <Text style={[styles.reverseLabel, reversed && styles.reverseLabelActive]}>
            {t('finder.reverse')}
          </Text>
        </Pressable>
      ) : coords ? (
        <Text style={styles.note}>{t('finder.noRouteNote')}</Text>
      ) : null}

      <FinderBody
        coords={coords}
        category={category}
        results={results}
        searching={searching}
      />
    </View>
  );
}

function FinderBody({
  coords,
  category,
  results,
  searching,
}: {
  coords: LatLng | null;
  category: PoiCategory;
  results: FinderResult[];
  searching: boolean;
}) {
  const { t } = useTranslation();

  if (!coords) {
    return (
      <View style={styles.centered}>
        <Ionicons name="location-outline" size={40} color={colors.textPlaceholder} />
        <Text style={styles.stateTitle}>{t('finder.locationNeededTitle')}</Text>
        <Text style={styles.stateBody}>{t('finder.locationNeededBody')}</Text>
      </View>
    );
  }

  if (searching && results.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.actionPrimary} />
        <Text style={styles.stateBody}>{t('finder.searching')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={results}
      style={styles.list}
      keyExtractor={(r) => `${r.poi.name}@${r.poi.lat},${r.poi.lng}`}
      renderItem={({ item }) => <ResultRow result={item} category={category} />}
      ItemSeparatorComponent={Separator}
      contentContainerStyle={results.length === 0 ? styles.emptyContainer : undefined}
      ListEmptyComponent={<Text style={styles.empty}>{t('finder.empty')}</Text>}
    />
  );
}

function CategoryChip({
  category,
  active,
  onPress,
}: {
  category: PoiCategory;
  active: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[category];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive, active && shadows.sm]}
    >
      <Ionicons
        name={meta.icon}
        size={20}
        color={active ? colors.actionPrimaryText : colors.textSecondary}
      />
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
        {t(meta.labelKey)}
      </Text>
    </Pressable>
  );
}

function ResultRow({
  result,
  category,
}: {
  result: FinderResult;
  category: PoiCategory;
}) {
  const { t } = useTranslation();
  const { poi } = result;
  const subtitle =
    result.awayKm != null
      ? t('finder.awayKm', { km: round1(result.awayKm) })
      : `${t('finder.aheadKm', { km: round1(result.aheadKm ?? 0) })} · ${t('finder.detourKm', {
          km: round1(result.detourKm ?? 0),
        })}`;

  return (
    <View style={styles.row}>
      <Ionicons
        name={CATEGORY_META[category].icon}
        size={22}
        color={colors.textSecondary}
        style={styles.rowIcon}
      />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {poi.name}
        </Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Pressable
        onPress={() =>
          Linking.openURL(`https://maps.apple.com/?daddr=${poi.lat},${poi.lng}`).catch(
            () => {}
          )
        }
        accessibilityRole="button"
        accessibilityLabel={t('finder.directions')}
        hitSlop={spacing[2]}
        style={styles.directionsButton}
      >
        <Ionicons name="navigate" size={20} color={colors.actionPrimary} />
      </Pressable>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chipScroll: {
    flexGrow: 0,
  },
  chipRow: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  list: {
    flex: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
    backgroundColor: colors.backgroundSecondary,
  },
  chipActive: {
    backgroundColor: colors.actionPrimary,
  },
  chipLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  chipLabelActive: {
    color: colors.actionPrimaryText,
    fontWeight: typography.weights.semibold,
  },
  reverseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  reverseLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  reverseLabelActive: {
    color: colors.actionPrimary,
    fontWeight: typography.weights.semibold,
  },
  note: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  rowIcon: {
    marginRight: spacing[3],
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  directionsButton: {
    padding: spacing[2],
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginLeft: spacing[4],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[6],
  },
  stateTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  stateBody: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
    paddingHorizontal: spacing[6],
  },
});
