import { useState, useMemo } from 'react';
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
  visited: boolean;
}

interface OnsenSection {
  /** Raw Firestore area name; '' when the onsen has no area (rendered with a fallback label). */
  areaName: string;
  visitedCount: number;
  total: number;
  /** Every onsen in the area has been visited — these sections sink to the bottom. */
  complete: boolean;
  data: OnsenListItem[];
}

interface OnsenListProps {
  data: OnsenListItem[];
  loading: boolean;
  /** Trailing indicator for unvisited rows: a chevron (browse) or an empty circle (checklist). */
  unvisitedVariant: 'chevron' | 'circle';
}

/**
 * The shared onsen list used by the Onsens browse tab and the record-a-visit
 * checklist: a search box over a list grouped into sticky area sections. Each
 * header shows the area's visited/total count; fully-visited areas sink to the
 * bottom so what's left stays near the top. Within an area, rows keep a stable
 * alphabetical order (visited rows just gain the amber tick rather than moving).
 * Unvisited rows show the per-screen idiom; tapping a row opens its detail.
 */
export function OnsenList({ data, loading, unvisitedVariant }: OnsenListProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const sections = useMemo<OnsenSection[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? data.filter(
          (o) => o.name.toLowerCase().includes(q) || o.areaName.toLowerCase().includes(q)
        )
      : data;

    const byArea = new Map<string, OnsenListItem[]>();
    for (const item of filtered) {
      const rows = byArea.get(item.areaName);
      if (rows) rows.push(item);
      else byArea.set(item.areaName, [item]);
    }

    const result: OnsenSection[] = [...byArea.entries()].map(([areaName, rows]) => {
      const visitedCount = rows.filter((r) => r.visited).length;
      return {
        areaName,
        visitedCount,
        total: rows.length,
        complete: visitedCount === rows.length,
        // Stable order within an area; visited rows stay put and gain the tick.
        data: [...rows].sort((a, b) => a.name.localeCompare(b.name)),
      };
    });

    // Areas with onsens still to visit first, then completed areas; alphabetical within each group.
    return result.sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? 1 : -1;
      return a.areaName.localeCompare(b.areaName);
    });
  }, [data, searchQuery]);

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
          renderItem={({ item }) => (
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
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {section.areaName || t('onsenList.areaUnknown')}
              </Text>
              <Text style={styles.sectionCount}>
                {t('onsenList.sectionCount', {
                  visited: section.visitedCount,
                  total: section.total,
                })}
              </Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {searchQuery.trim()
                ? t('onsenList.emptySearch', { query: searchQuery })
                : t('onsenList.emptyData')}
            </Text>
          }
          contentContainerStyle={sections.length === 0 && styles.emptyContainer}
          stickySectionHeadersEnabled
        />
      )}
    </View>
  );
}

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
