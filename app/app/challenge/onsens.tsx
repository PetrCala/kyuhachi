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
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { VisitedBadge } from '@/components/VisitedBadge';
import { colors, spacing, typography, radii } from '@/theme';

/**
 * The challenge-scoped onsen checklist reached from the home "Record a visit"
 * button: the eligible onsens (unvisited first) with a search box. Tapping a
 * row opens the onsen detail screen, which owns the actual mark-visited flow.
 */
export default function RecordVisit() {
  const { t } = useTranslation();
  const { rows, loading } = useActiveChallengeProgress();
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (o) => o.name.toLowerCase().includes(q) || o.areaName.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  return (
    <>
      <Stack.Screen
        options={{ title: t('challengeProgress.recordVisitTitle'), headerShown: true }}
      />
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
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => router.push(`/onsens/${item.id}`)}>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowArea}>{item.areaName}</Text>
                </View>
                {item.visited ? (
                  <VisitedBadge />
                ) : (
                  <Text style={styles.unvisited}>○</Text>
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
            contentContainerStyle={filtered.length === 0 && styles.emptyContainer}
          />
        )}
      </View>
    </>
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
  unvisited: {
    fontSize: typography.sizes.xl,
    color: colors.textPlaceholder,
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
