import { useState, useEffect, useMemo } from 'react';
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
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { OnsenDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { VisitedBadge } from '@/components/VisitedBadge';
import { db } from '@/firebase';
import { colors, spacing, typography, radii } from '@/theme';

type OnsenRow = OnsenDocument & { id: string };

export default function OnsenList() {
  const { t } = useTranslation();
  // Visited state for the active challenge comes from the shared hook so this
  // tab, the home dashboard, and the record-a-visit list stay in sync.
  const { visitedIds } = useActiveChallengeProgress();
  const [onsens, setOnsens] = useState<OnsenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(
        collection(db, COLLECTIONS.ONSENS),
        where('isActive', '==', true),
        orderBy('areaName'),
        orderBy('name')
      ),
      (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
        setOnsens(
          snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as OnsenDocument) }))
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsubscribe;
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return onsens;
    return onsens.filter((o) => o.name.toLowerCase().includes(q));
  }, [onsens, searchQuery]);

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
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/onsens/${item.id}`)}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowArea}>{item.areaName}</Text>
              </View>
              {visitedIds.has(item.id) ? (
                <VisitedBadge />
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
          contentContainerStyle={filtered.length === 0 && styles.emptyContainer}
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
