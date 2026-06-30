import { memo, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { VisitedBadge } from '@/components/VisitedBadge';
import { usePreferences } from '@/context/PreferencesContext';
import { useUserLocation } from '@/hooks/useUserLocation';
import { haversineKm } from '@/lib/geo';
import { simulatedCoordinate } from '@/lib/dev-location';
import { onsenReading } from '@/lib/onsen-name';
import { colors, spacing, typography, radii } from '@/theme';

export interface OnsenListItem {
  id: string;
  name: string;
  /** Hiragana reading of `name`; the within-prefecture sort key. null → fall back to `name`. */
  nameKana: string | null;
  /** Hepburn reading of `name`, shown under the kanji in non-JP UI. null = none published. */
  nameRomaji: string | null;
  areaName: string;
  prefecture: string;
  lat: number;
  lng: number;
  visited: boolean;
}

/** An item as rendered; the nearby section attaches the measured distance. */
type DisplayItem = OnsenListItem & { distanceKm?: number };

interface OnsenSection {
  /** Unique across blocks: 'near', or a prefecture once unvisited and once visited. */
  key: string;
  /** The top distance-sorted section, shown above the prefecture blocks. */
  near: boolean;
  /** Raw Firestore prefecture; '' when missing (rendered with a fallback label). */
  prefecture: string;
  /** Whether this is a section of the bottom (visited) block. */
  visited: boolean;
  /** Visited / total shown on the header (prefecture-wide, or section-wide for `near`). */
  visitedCount: number;
  total: number;
  data: DisplayItem[];
}

interface OnsenListProps {
  data: OnsenListItem[];
  loading: boolean;
  /** Trailing indicator for unvisited rows: a chevron (browse) or an empty circle (checklist). */
  unvisitedVariant: 'chevron' | 'circle';
  /**
   * Row tap handler. Defaults to opening the onsen detail screen (browse). The
   * record-a-visit list passes its own handler to open the visit modal directly.
   * Must be referentially stable (wrap in `useCallback`) so rows stay memoized.
   */
  onItemPress?: (item: OnsenListItem) => void;
}

/** A single row, memoized so scrolling doesn't re-render rows that haven't changed. */
const OnsenListRow = memo(function OnsenListRow({
  item,
  unvisitedVariant,
  distanceLabel,
  reading,
  onPress,
}: {
  item: OnsenListItem;
  unvisitedVariant: 'chevron' | 'circle';
  distanceLabel?: string;
  /** Romaji reading shown under the name in non-JP UI; omitted when there's none. */
  reading?: string;
  onPress?: (item: OnsenListItem) => void;
}) {
  return (
    <Pressable
      style={styles.row}
      onPress={() => (onPress ? onPress(item) : router.push(`/onsens/${item.id}`))}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{item.name}</Text>
        {reading ? <Text style={styles.rowReading}>{reading}</Text> : null}
      </View>
      {distanceLabel ? <Text style={styles.distance}>{distanceLabel}</Text> : null}
      {item.visited ? (
        <VisitedBadge />
      ) : unvisitedVariant === 'circle' ? (
        <View style={styles.unvisitedCircle} />
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
});

/**
 * The shared onsen list used by the Onsens browse tab and the record-a-visit
 * checklist. A search box over a SectionList:
 *
 *  1. "Near you" — onsens within ~20km of the user (visited and unvisited),
 *     nearest first, each row showing its distance. Hidden when there's no
 *     location fix. Its onsens are pulled out of the prefecture blocks below so
 *     they don't appear twice.
 *  2. Unvisited prefectures, then visited prefectures — so a visited onsen never
 *     sits above an unvisited one. Headers show the prefecture's visited/total.
 *
 * Grouping by prefecture (not the finer area) keeps the number of sticky headers
 * small (~8), which is what makes the scroll feel smooth.
 */
export function OnsenList({ data, loading, unvisitedVariant, onItemPress }: OnsenListProps) {
  const { t, i18n } = useTranslation();
  const { showNearby, nearRadiusKm, loaded: prefsLoaded } = usePreferences();
  const [searchQuery, setSearchQuery] = useState('');

  // Real device location in production; a fixed Kyushu spot in dev so the nearby
  // section can be exercised away from Japan (mirrors the map screen). Skip the
  // location request entirely when the user has turned the nearby section off.
  const deviceCoords = useUserLocation(!__DEV__ && prefsLoaded && showNearby);
  const center = useMemo<{ lat: number; lng: number } | null>(() => {
    if (!showNearby) return null;
    if (__DEV__) {
      if (data.length === 0) return null;
      const sim = simulatedCoordinate(
        null,
        data.map((o) => ({ lat: o.lat, lng: o.lng }))
      );
      return { lat: sim.latitude, lng: sim.longitude };
    }
    return deviceCoords;
  }, [showNearby, deviceCoords, data]);

  const sections = useMemo<OnsenSection[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? data.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            // Romaji so a non-JP user can find an onsen by typing its reading
            // (e.g. "beppu") rather than its kanji.
            (o.nameRomaji?.toLowerCase().includes(q) ?? false) ||
            o.prefecture.toLowerCase().includes(q) ||
            o.areaName.toLowerCase().includes(q)
        )
      : data;

    // "Near you": within radius of the user, nearest first, visited + unvisited
    // together. Pulled out so they don't repeat in their prefecture sections.
    const nearbyItems: DisplayItem[] = [];
    const nearbyIds = new Set<string>();
    if (center) {
      const measured = filtered
        .map((o) => ({ o, km: haversineKm(center, { lat: o.lat, lng: o.lng }) }))
        .filter((x) => x.km <= nearRadiusKm)
        .sort((a, b) => a.km - b.km);
      for (const { o, km } of measured) {
        nearbyItems.push({ ...o, distanceKm: km });
        nearbyIds.add(o.id);
      }
    }

    const remaining = nearbyIds.size
      ? filtered.filter((o) => !nearbyIds.has(o.id))
      : filtered;

    // Per-prefecture progress over what's actually shown in the prefecture blocks.
    const totals = new Map<string, { visited: number; total: number }>();
    for (const item of remaining) {
      const cur = totals.get(item.prefecture) ?? { visited: 0, total: 0 };
      cur.total += 1;
      if (item.visited) cur.visited += 1;
      totals.set(item.prefecture, cur);
    }

    // One block of prefecture sections for a given visited state.
    const block = (visited: boolean): OnsenSection[] => {
      const byPrefecture = new Map<string, DisplayItem[]>();
      for (const item of remaining) {
        if (item.visited !== visited) continue;
        const rows = byPrefecture.get(item.prefecture);
        if (rows) rows.push(item);
        else byPrefecture.set(item.prefecture, [item]);
      }
      return [...byPrefecture.entries()]
        .map(([prefecture, rows]) => {
          const progress = totals.get(prefecture) ?? { visited: 0, total: rows.length };
          return {
            key: `${visited ? 'v' : 'u'}:${prefecture}`,
            near: false,
            prefecture,
            visited,
            visitedCount: progress.visited,
            total: progress.total,
            // Cluster by area (the finer subdivision within the prefecture) so
            // onsens from the same hot-spring town sit together, then by reading
            // (yomi) so the order is meaningful to a reader. Falls back to `name`
            // until the catalog publishes readings; hiragana sorts correctly by
            // code point (gojūon), so no locale collation is needed.
            data: [...rows].sort(
              (a, b) =>
                a.areaName.localeCompare(b.areaName) ||
                (a.nameKana ?? a.name).localeCompare(b.nameKana ?? b.name)
            ),
          };
        })
        .sort((a, b) => a.prefecture.localeCompare(b.prefecture));
    };

    const nearSection: OnsenSection[] = nearbyItems.length
      ? [
          {
            key: 'near',
            near: true,
            prefecture: '',
            visited: false,
            visitedCount: nearbyItems.filter((o) => o.visited).length,
            total: nearbyItems.length,
            data: nearbyItems,
          },
        ]
      : [];

    // Near you, then unvisited prefectures, then visited prefectures.
    return [...nearSection, ...block(false), ...block(true)];
  }, [data, searchQuery, center, nearRadiusKm]);

  const renderItem = useCallback(
    ({ item, section }: { item: DisplayItem; section: OnsenSection }) => (
      <OnsenListRow
        item={item}
        unvisitedVariant={unvisitedVariant}
        onPress={onItemPress}
        reading={onsenReading(item.nameRomaji, i18n.language) ?? undefined}
        distanceLabel={
          section.near && item.distanceKm !== undefined
            ? t('onsenList.distanceKm', { km: item.distanceKm.toFixed(1) })
            : undefined
        }
      />
    ),
    [unvisitedVariant, onItemPress, t, i18n.language]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: OnsenSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, section.visited && styles.sectionTitleVisited]}>
          {section.near
            ? t('onsenList.nearYouTitle')
            : section.prefecture || t('onsenList.prefectureUnknown')}
        </Text>
        <Text style={styles.sectionCount}>
          {t('onsenList.sectionCount', { visited: section.visitedCount, total: section.total })}
        </Text>
      </View>
    ),
    [t]
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder={t('onsenList.searchPlaceholder')}
        placeholderTextColor={colors.textPlaceholder}
        value={searchQuery}
        onChangeText={setSearchQuery}
        clearButtonMode="while-editing"
        autoCorrect={false}
      />

      {loading ? (
        <ActivityIndicator style={styles.centered} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {searchQuery.trim()
                ? t('onsenList.emptySearch', { query: searchQuery })
                : t('onsenList.emptyData')}
            </Text>
          }
          contentContainerStyle={sections.length === 0 && styles.emptyContainer}
          stickySectionHeadersEnabled
          initialNumToRender={16}
          windowSize={11}
        />
      )}
    </View>
  );
}

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchInput: {
    margin: spacing[4],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.lg,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
  },
  centered: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: colors.backgroundSecondary,
  },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  sectionTitleVisited: {
    color: colors.textMuted,
  },
  sectionCount: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    backgroundColor: colors.background,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  },
  rowReading: {
    marginTop: spacing[1],
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  distance: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginLeft: spacing[2],
  },
  chevron: {
    fontSize: typography.sizes.xl,
    color: colors.textPlaceholder,
    marginLeft: spacing[2],
  },
  unvisitedCircle: {
    width: spacing[5],
    height: spacing[5],
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.textPlaceholder,
    marginLeft: spacing[2],
  },
  separator: {
    height: 1,
    backgroundColor: colors.separator,
    marginLeft: spacing[4],
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
    paddingHorizontal: spacing[6],
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
