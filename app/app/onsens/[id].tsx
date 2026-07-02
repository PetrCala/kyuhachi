import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { VisitFeedItem } from '@/lib/visit-feed';
import { VisitCard } from '@/components/VisitCard';
import { OnsenInfoRow } from '@/components/OnsenInfoRow';
import { OnsenFee } from '@/components/OnsenFee';
import { OnsenHours } from '@/components/OnsenHours';
import RecordVisitFab from '@/components/RecordVisitFab';
import { useVisit } from '@/hooks/useVisit';
import { onsenReading } from '@/lib/onsen-name';
import { useOnsenCatalog } from '@/context/OnsenCatalogContext';
import { usePreferences } from '@/context/PreferencesContext';
import { colors, spacing, typography, radii } from '@/theme';

export default function OnsenDetail() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  // Whether onsen pages embed a tappable map preview (default) or instead show a
  // compact map icon in the header. Both routes focus this onsen on the Map tab.
  const { showOnsenMapPreview, showReadings } = usePreferences();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Served from the offline-first catalog store — archived onsens included, so
  // a visited-then-deprecated onsen still opens.
  const { onsenMap, loading } = useOnsenCatalog();
  const onsen = id ? (onsenMap.get(id) ?? null) : null;

  const { challengeId, visit, loading: visitLoading } = useVisit(id);

  // Opens the visit editor. The visit isn't created until the user saves there,
  // so reaching the editor — or tapping the button by accident — records nothing
  // on its own.
  function openVisitEditor() {
    if (!id) return;
    router.push({ pathname: '/onsens/edit-visit', params: { id } });
  }

  // Jump to the Map tab and center on this onsen's pin. `focusTs` makes each tap
  // a fresh request so the map re-focuses even on a repeat visit to the same id.
  function showOnMap() {
    router.push({
      pathname: '/map',
      params: { focusOnsenId: id, focusTs: String(Date.now()) },
    });
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true }} />
        <ActivityIndicator style={styles.centered} />
      </>
    );
  }

  if (!onsen) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('onsenDetail.notFound')}</Text>
        </View>
      </>
    );
  }

  const feedItem: VisitFeedItem | null = visit
    ? {
        onsenId: onsen.id,
        onsenName: onsen.name,
        nameKana: onsen.nameKana,
        nameRomaji: onsen.nameRomaji,
        areaName: onsen.areaName,
        prefecture: onsen.prefecture,
        visit,
      }
    : null;

  const showVisitButton = !!challengeId && !visit && !visitLoading;
  // Reading shown under the kanji — romaji in a non-JP UI, kana in Japanese.
  const reading = onsenReading({
    nameRomaji: onsen.nameRomaji,
    nameKana: onsen.nameKana,
    language: i18n.language,
    showReadings,
  });

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: onsen.name,
          headerShown: true,
          // When the in-body preview is off, surface the map action as a compact
          // header icon instead.
          headerRight: showOnsenMapPreview
            ? undefined
            : () => (
                <Pressable
                  onPress={showOnMap}
                  hitSlop={spacing[2]}
                  accessibilityRole="button"
                  accessibilityLabel={t('onsenDetail.showOnMap')}
                >
                  <Ionicons
                    name="map-outline"
                    size={typography.sizes.xl}
                    color={colors.actionPrimary}
                  />
                </Pressable>
              ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, showVisitButton && styles.contentWithFab]}
      >
        {onsen.imageUrl && (
          <Image
            source={onsen.imageUrl}
            style={styles.image}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            placeholder={onsen.blurhash ? { blurhash: onsen.blurhash } : undefined}
            placeholderContentFit="cover"
          />
        )}

        <View style={styles.header}>
          <Text style={styles.name} selectable>
            {onsen.name}
          </Text>
          {reading && (
            <Text style={styles.reading} selectable>
              {reading}
            </Text>
          )}
          <Text style={styles.area} selectable>
            {onsen.areaName}　{onsen.prefecture}
          </Text>
          {!onsen.isActive && (
            <View style={styles.archivedBadge}>
              <Text style={styles.archivedText}>{t('onsenDetail.archived')}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <OnsenInfoRow
            label={t('onsenDetail.labelAddress')}
            value={onsen.address}
            action={{
              icon: 'navigate',
              onPress: () =>
                Linking.openURL(`https://maps.apple.com/?daddr=${onsen.lat},${onsen.lng}`),
              accessibilityLabel: t('onsenDetail.getDirections'),
            }}
          />
          {onsen.phone && (
            <OnsenInfoRow
              label={t('onsenDetail.labelPhone')}
              value={onsen.phone}
              onPress={() => Linking.openURL(`tel:${onsen.phone!.replace(/[^\d+]/g, '')}`)}
            />
          )}
          <OnsenFee admissionFee={onsen.admissionFee} adultFee={onsen.adultFee} />
          {onsen.springQuality && (
            <OnsenInfoRow label={t('onsenDetail.labelSpringQuality')} value={onsen.springQuality} />
          )}
          {onsen.businessHours && <OnsenHours hours={onsen.businessHours} />}
        </View>

        {showOnsenMapPreview && (
          <View style={styles.mapPreviewSection}>
            <Pressable
              style={styles.mapPreviewCard}
              onPress={showOnMap}
              accessibilityRole="button"
              accessibilityLabel={t('onsenDetail.showOnMap')}
            >
              <MapView
                style={styles.miniMap}
                provider={PROVIDER_DEFAULT}
                pointerEvents="none"
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                initialRegion={{
                  latitude: onsen.lat,
                  longitude: onsen.lng,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }}
              >
                <Marker coordinate={{ latitude: onsen.lat, longitude: onsen.lng }} />
              </MapView>
            </Pressable>
          </View>
        )}

        {onsen.websiteUrl && (
          <View style={styles.section}>
            <Pressable
              onPress={() => Linking.openURL(onsen.websiteUrl!)}
              accessibilityRole="link"
              hitSlop={spacing[1]}
            >
              <Text style={styles.websiteLink} selectable>
                {onsen.websiteUrl}
              </Text>
            </Pressable>
          </View>
        )}

        {feedItem && (
          <View style={styles.visitSummarySection}>
            <VisitCard
              item={feedItem}
              hideOnsenHeader
              completed
              onEdit={() =>
                router.push({ pathname: '/onsens/edit-visit', params: { id: onsen.id } })
              }
            />
          </View>
        )}
      </ScrollView>

      {showVisitButton && (
        <RecordVisitFab
          style={[styles.fab, { bottom: spacing[6] + insets.bottom }]}
          accessibilityLabel={t('onsenDetail.markVisited')}
          onPress={openVisitEditor}
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
  content: {
    paddingBottom: spacing[10],
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
  },
  image: {
    width: '100%',
    height: 220,
    backgroundColor: colors.backgroundSecondary,
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  name: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  reading: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginBottom: spacing[1],
  },
  area: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  archivedBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing[2],
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.sm,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  archivedText: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
  },
  section: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    paddingBottom: spacing[2],
  },
  websiteLink: {
    fontSize: typography.sizes.sm,
    color: colors.actionPrimary,
    textDecorationLine: 'underline',
    paddingVertical: spacing[2],
  },
  mapPreviewSection: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  // Rounded card that clips the preview map's corners.
  mapPreviewCard: {
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  miniMap: {
    width: '100%',
    height: 160,
    backgroundColor: colors.backgroundSecondary,
  },
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Floating action button, anchored bottom-right above the home indicator.
  fab: {
    position: 'absolute',
    right: spacing[4],
  },
  // Extra scroll clearance so the last content never hides behind the FAB.
  contentWithFab: {
    paddingBottom: spacing[12] + spacing[8],
  },
  visitSummarySection: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
});
