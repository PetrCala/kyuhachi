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
import { colors, spacing, typography, radii } from '@/theme';

export interface OnsenListItem {
  id: string;
  name: string;
  areaName: string;
  prefecture: string;
  visited: boolean;
}

interface OnsenSection {
  /** Unique across both blocks: a prefecture appears once unvisited, once visited. */
  key: string;
  /** Raw Firestore prefecture; '' when missing (rendered with a fallback label). */
  prefecture: string;
  /** Whether this is a section of the bottom (visited) block. */
  visited: boolean;
  /** Visited / total for the whole prefecture (same on both of its blocks' headers). */
  visitedCount: number;
  total: number;
  data: OnsenListItem[];
}

interface OnsenListProps {
  data: OnsenListItem[];
  loading: boolean;
  /** Trailing indicator for unvisited rows: a chevron (browse) or an empty circle (checklist). */
  unvisitedVariant: 'chevron' | 'circle';
}

/** A single row, memoized so scrolling doesn't re-render rows that haven't changed. */
const OnsenListRow = memo(function OnsenListRow({
  item,
  unvisitedVariant,
}: {
  item: OnsenListItem;
  unvisitedVariant: 'chevron' | 'circle';
}) {
  return (
    <Pressable style={styles.row} onPress={() => router.push(`/onsens/${item.id}`)}>
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{item.name}</Text>
      </View>
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
 * checklist: a search box over a list grouped into sticky prefecture sections.
 * Unvisited onsens come first (one section per prefecture), then all visited
 * onsens (again one section per prefecture) — so a visited onsen never sits
 * above an unvisited one. Each header shows the prefecture's visited/total.
 * Within a section, rows keep a stable alphabetical order. Tapping a row opens
 * its detail.
 *
 * Grouping by prefecture (rather than the finer area) keeps the number of
 * sticky headers small (~8), which is what makes the scroll feel smooth.
 */
export function OnsenList({ data, loading, unvisitedVariant }: OnsenListProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const sections = useMemo<OnsenSection[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? data.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            o.prefecture.toLowerCase().includes(q) ||
            o.areaName.toLowerCase().includes(q)
        )
      : data;

    // Per-prefecture progress, shown identically on both of a prefecture's headers.
    const totals = new Map<string, { visited: number; total: number }>();
    for (const item of filtered) {
      const cur = totals.get(item.prefecture) ?? { visited: 0, total: 0 };
      cur.total += 1;
      if (item.visited) cur.visited += 1;
      totals.set(item.prefecture, cur);
    }

    // One block of prefecture sections for a given visited state.
    const block = (visited: boolean): OnsenSection[] => {
      const byPrefecture = new Map<string, OnsenListItem[]>();
      for (const item of filtered) {
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
            prefecture,
            visited,
            visitedCount: progress.visited,
            total: progress.total,
            data: [...rows].sort((a, b) => a.name.localeCompare(b.name)),
          };
        })
        .sort((a, b) => a.prefecture.localeCompare(b.prefecture));
    };

    // Unvisited prefectures first, visited prefectures last.
    return [...block(false), ...block(true)];
  }, [data, searchQuery]);

  const renderItem = useCallback(
    ({ item }: { item: OnsenListItem }) => (
      <OnsenListRow item={item} unvisitedVariant={unvisitedVariant} />
    ),
    [unvisitedVariant]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: OnsenSection }) => (
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, section.visited && styles.sectionTitleVisited]}>
          {section.prefecture || t('onsenList.prefectureUnknown')}
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
