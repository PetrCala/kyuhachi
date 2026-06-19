import { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
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

interface OnsenListProps {
  data: OnsenListItem[];
  loading: boolean;
  /** Trailing indicator for unvisited rows: a chevron (browse) or an empty circle (checklist). */
  unvisitedVariant: 'chevron' | 'circle';
}

/**
 * The shared onsen list used by the Onsens browse tab and the record-a-visit
 * checklist: a search box over a list that always sinks visited onsens to the
 * bottom (then orders by area, then name). Visited rows show the amber tick;
 * unvisited rows show the per-screen idiom. Tapping a row opens its detail.
 */
export function OnsenList({ data, loading, unvisitedVariant }: OnsenListProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const items = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? data.filter(
          (o) => o.name.toLowerCase().includes(q) || o.areaName.toLowerCase().includes(q)
        )
      : data;
    return [...filtered].sort((a, b) => {
      // Visited last, then alphabetical by area then name.
      if (a.visited !== b.visited) return a.visited ? 1 : -1;
      const areaComp = a.areaName.localeCompare(b.areaName);
      if (areaComp !== 0) return areaComp;
      return a.name.localeCompare(b.name);
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
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/onsens/${item.id}`)}>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowArea}>{item.areaName}</Text>
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
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {searchQuery.trim()
                ? t('onsenList.emptySearch', { query: searchQuery })
                : t('onsenList.emptyData')}
            </Text>
          }
          contentContainerStyle={items.length === 0 && styles.emptyContainer}
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
    marginBottom: spacing[1],
  },
  rowArea: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
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
