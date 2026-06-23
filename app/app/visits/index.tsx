import { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { VisitCard } from '@/components/VisitCard';
import { buildVisitFeed } from '@/lib/visit-feed';
import { colors, spacing, typography } from '@/theme';

/** The full visit history for the active challenge, newest first. Reached from
 *  the home screen's "See all". Reuses the same hook the home preview reads, so
 *  there's no separate query — rows tap through to the onsen detail screen. */
export default function AllVisits() {
  const { t } = useTranslation();
  const { loading, visits, onsenMap } = useActiveChallengeProgress();
  const feed = useMemo(() => buildVisitFeed(visits, onsenMap), [visits, onsenMap]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('visits.title'), headerShown: true }} />
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('visits.title'), headerShown: true }} />
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.content}
        data={feed}
        keyExtractor={(item) => item.onsenId}
        renderItem={({ item }) => (
          <VisitCard item={item} onPress={() => router.push(`/onsens/${item.onsenId}`)} />
        )}
        ListEmptyComponent={<Text style={styles.empty}>{t('visits.empty')}</Text>}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    paddingBottom: spacing[8],
  },
  empty: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing[8],
  },
});
