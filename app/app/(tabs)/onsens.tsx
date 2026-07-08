import { useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { useFavorites } from '@/context/FavoritesContext';
import { useOnsenCatalog } from '@/context/OnsenCatalogContext';
import { OnsenList, type OnsenListItem } from '@/components/OnsenList';
import { colors, spacing, typography } from '@/theme';

export default function OnsenBrowse() {
  const { t } = useTranslation();
  // Visited state for the active challenge comes from the shared hook so this
  // tab, the home dashboard, and the record-a-visit list stay in sync.
  const { visitedIds } = useActiveChallengeProgress();
  // The catalog comes from the offline-first local store (display order is
  // handled by OnsenList), so this tab works with no network at all.
  const { activeOnsens, loading } = useOnsenCatalog();
  const { favoriteIds } = useFavorites();
  // Session-only filter — deliberately not persisted, so the tab always opens
  // showing the full list.
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const items = useMemo<OnsenListItem[]>(() => {
    const source = favoritesOnly
      ? activeOnsens.filter((o) => favoriteIds.has(o.id))
      : activeOnsens;
    return source.map((o) => ({
      id: o.id,
      name: o.name,
      nameKana: o.nameKana,
      nameRomaji: o.nameRomaji,
      areaName: o.areaName,
      prefecture: o.prefecture,
      lat: o.lat,
      lng: o.lng,
      visited: visitedIds.has(o.id),
    }));
  }, [activeOnsens, visitedIds, favoritesOnly, favoriteIds]);

  return (
    <>
      <Tabs.Screen
        options={{
          headerRight: () => (
            <Pressable
              style={styles.headerButton}
              onPress={() => setFavoritesOnly((v) => !v)}
              hitSlop={spacing[2]}
              accessibilityRole="button"
              accessibilityLabel={
                favoritesOnly ? t('onsenList.showAll') : t('onsenList.favoritesOnly')
              }
            >
              <Ionicons
                name={favoritesOnly ? 'heart' : 'heart-outline'}
                size={typography.sizes.xl}
                color={favoritesOnly ? colors.destructive : colors.actionPrimary}
              />
            </Pressable>
          ),
        }}
      />
      <OnsenList
        data={items}
        loading={loading}
        unvisitedVariant="chevron"
        emptyMessage={favoritesOnly ? t('onsenList.emptyFavorites') : undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // The JS tabs header adds no trailing inset of its own.
  headerButton: {
    marginRight: spacing[4],
  },
});
