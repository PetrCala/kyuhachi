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
import { Stack, router } from 'expo-router';
import firestore from '@react-native-firebase/firestore';
import type { OnsenDocument } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import { colors, spacing, typography, radii } from '../../src/theme';

type OnsenRow = OnsenDocument & { id: string };

export default function OnsenList() {
  const [onsens, setOnsens] = useState<OnsenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsubscribe = firestore()
      .collection(COLLECTIONS.ONSENS)
      .where('isActive', '==', true)
      .orderBy('areaName')
      .orderBy('name')
      .onSnapshot(
        (snapshot) => {
          setOnsens(
            snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as OnsenDocument) }))
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
    <>
      <Stack.Screen options={{ title: '温泉一覧', headerShown: true }} />
      <View style={styles.container}>
        <TextInput
          style={styles.searchInput}
          placeholder="温泉を検索…"
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
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {searchQuery.trim()
                  ? `「${searchQuery}」に一致する温泉はありません`
                  : '温泉データがありません'}
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
