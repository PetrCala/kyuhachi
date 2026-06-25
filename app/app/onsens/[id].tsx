import { useState, useEffect, type ComponentProps } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  doc,
  onSnapshot,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { OnsenDocument, WeeklySchedule } from '@kyuhachi/shared';
import { COLLECTIONS } from '@kyuhachi/shared';
import type { VisitFeedItem } from '@/lib/visit-feed';
import { VisitCard } from '@/components/VisitCard';
import RecordVisitFab from '@/components/RecordVisitFab';
import { useVisit } from '@/hooks/useVisit';
import { usePreferences } from '@/context/PreferencesContext';
import { db } from '@/firebase';
import { colors, spacing, typography, radii } from '@/theme';

type OnsenWithId = OnsenDocument & { id: string };

const WEEKDAYS: (keyof WeeklySchedule)[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

// Collapse consecutive days (Mon→Sun) sharing the same window / closed state.
function groupSchedule(schedule: WeeklySchedule) {
  const groups: { days: (keyof WeeklySchedule)[]; slot: WeeklySchedule['monday'] }[] = [];
  for (const day of WEEKDAYS) {
    const slot = schedule[day];
    const last = groups[groups.length - 1];
    const same =
      !!last &&
      ((last.slot === null && slot === null) ||
        (!!last.slot && !!slot && last.slot.opens === slot.opens && last.slot.closes === slot.closes));
    if (same) last.days.push(day);
    else groups.push({ days: [day], slot });
  }
  return groups;
}

function InfoRow({
  label,
  value,
  onPress,
  action,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  /** An inline icon (e.g. directions) shown right after the value text, tappable on its own. */
  action?: {
    icon: ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
    accessibilityLabel: string;
  };
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel} selectable>
        {label}
      </Text>
      {onPress ? (
        <Pressable
          style={styles.infoValuePressable}
          onPress={onPress}
          accessibilityRole="button"
          hitSlop={4}
        >
          <Text style={[styles.infoValue, styles.infoValueLink]} selectable>
            {value}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.infoValue} selectable>
          {value}
          {action && (
            <Text
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              suppressHighlighting
            >
              {'  '}
              <Ionicons name={action.icon} size={typography.sizes.md} color={colors.actionPrimary} />
            </Text>
          )}
        </Text>
      )}
    </View>
  );
}

export default function OnsenDetail() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  // Whether onsen pages embed a tappable map preview (default) or instead show a
  // compact map icon in the header. Both routes focus this onsen on the Map tab.
  const { showOnsenMapPreview } = usePreferences();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [onsen, setOnsen] = useState<OnsenWithId | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showWeek, setShowWeek] = useState(false);

  const { challengeId, visit, loading: visitLoading } = useVisit(id);

  // Listen to onsen document
  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(
      doc(db, COLLECTIONS.ONSENS, id),
      (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
        setOnsen(snapshot.exists() ? { id: snapshot.id, ...(snapshot.data() as OnsenDocument) } : null);
        setLoading(false);
      },
      () => {
        setOnsen(null);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [id]);

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

  const schedule = onsen.businessHours?.schedule ?? null;
  const hoursExceptions = onsen.businessHours?.exceptions ?? [];
  const hoursConfidence = onsen.businessHours?.confidence;
  const lang: 'en' | 'ja' = i18n.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
  const dayShort = (day: keyof WeeklySchedule) => t(`onsenDetail.dayShort.${day}`);
  const dayRange = (days: (keyof WeeklySchedule)[]) =>
    days.length === 1 ? dayShort(days[0]) : `${dayShort(days[0])}–${dayShort(days[days.length - 1])}`;
  const todayKey = WEEKDAYS[(new Date().getDay() + 6) % 7];
  const todaySlot = schedule ? schedule[todayKey] : null;
  const todayLabel = todaySlot
    ? `${todaySlot.opens}–${todaySlot.closes}`
    : t('onsenDetail.closedToday');
  const feedItem: VisitFeedItem | null = visit
    ? {
        onsenId: onsen.id,
        onsenName: onsen.name,
        areaName: onsen.areaName,
        prefecture: onsen.prefecture,
        visit,
      }
    : null;

  const showVisitButton = !!challengeId && !visit && !visitLoading;

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
          <Image source={{ uri: onsen.imageUrl }} style={styles.image} resizeMode="cover" />
        )}

        <View style={styles.header}>
          <Text style={styles.name} selectable>
            {onsen.name}
          </Text>
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
          <InfoRow
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
            <InfoRow
              label={t('onsenDetail.labelPhone')}
              value={onsen.phone}
              onPress={() => Linking.openURL(`tel:${onsen.phone!.replace(/[^\d+]/g, '')}`)}
            />
          )}
          {onsen.admissionFee && (
            <InfoRow label={t('onsenDetail.labelFee')} value={onsen.admissionFee} />
          )}
          {onsen.springQuality && (
            <InfoRow label={t('onsenDetail.labelSpringQuality')} value={onsen.springQuality} />
          )}
          {onsen.businessHours && (
            <>
              {/* Base hours: the weekly grid when structured, else the raw text. */}
              {schedule ? (
                <>
                  <Pressable
                    style={styles.hoursTodayRow}
                    onPress={() => setShowWeek((v) => !v)}
                    accessibilityRole="button"
                    hitSlop={4}
                  >
                    <Text style={styles.infoLabel}>{t('onsenDetail.today')}</Text>
                    <Text style={[styles.infoValue, styles.hoursTodayValue]} selectable>
                      {todayLabel}
                    </Text>
                    <Ionicons
                      name={showWeek ? 'chevron-up' : 'chevron-down'}
                      size={typography.sizes.md}
                      color={colors.textMuted}
                    />
                  </Pressable>
                  {showWeek &&
                    groupSchedule(schedule).map((g, i) => {
                      const isToday = g.days.includes(todayKey);
                      return (
                        <View key={i} style={styles.dayRow}>
                          <Text style={[styles.dayLabel, isToday && styles.dayToday]} selectable>
                            {dayRange(g.days)}
                          </Text>
                          <Text style={[styles.dayValue, isToday && styles.dayToday]} selectable>
                            {g.slot ? `${g.slot.opens}–${g.slot.closes}` : t('onsenDetail.closed')}
                          </Text>
                        </View>
                      );
                    })}
                </>
              ) : (
                <InfoRow label={t('onsenDetail.labelHours')} value={onsen.businessHours.raw} />
              )}

              {/* Flagged exceptions / irregularities (display-only captions). */}
              {hoursExceptions.map((ex, i) => (
                <Text key={i} style={styles.hoursException} selectable>
                  {`⚠ ${ex[lang] ?? ex.en}`}
                </Text>
              ))}
              {hoursConfidence && hoursConfidence !== 'high' && (
                <Text style={styles.hoursHint}>{t('onsenDetail.hoursVary')}</Text>
              )}

              {/* Let the user fall back to the verbatim source text. */}
              {schedule && (
                <>
                  <Pressable
                    style={styles.hoursToggle}
                    onPress={() => setShowOriginal((v) => !v)}
                    hitSlop={4}
                  >
                    <Text style={styles.hoursToggleText}>
                      {showOriginal ? t('onsenDetail.hideOriginal') : t('onsenDetail.showOriginal')}
                    </Text>
                  </Pressable>
                  {showOriginal && (
                    <Text style={styles.hoursRaw} selectable>
                      {onsen.businessHours.raw}
                    </Text>
                  )}
                </>
              )}
            </>
          )}
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
              hitSlop={4}
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
  infoRow: {
    flexDirection: 'row',
    paddingVertical: spacing[2],
  },
  infoLabel: {
    width: 80,
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  infoValuePressable: {
    flex: 1,
  },
  infoValueLink: {
    color: colors.actionPrimary,
    textDecorationLine: 'underline',
  },
  hoursToggle: {
    paddingVertical: spacing[2],
  },
  hoursToggleText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.actionPrimary,
  },
  dayRow: {
    flexDirection: 'row',
    paddingVertical: spacing[1],
  },
  dayLabel: {
    width: 80,
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  dayValue: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  hoursTodayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[1],
  },
  hoursTodayValue: {
    flex: 1,
    marginLeft: spacing[2],
  },
  dayToday: {
    color: colors.textPrimary,
    fontWeight: typography.weights.medium,
  },
  hoursHeader: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginBottom: spacing[1],
  },
  hoursException: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: 20,
    paddingVertical: spacing[1] / 2,
  },
  hoursHint: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
    paddingTop: spacing[1],
  },
  hoursRaw: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: 20,
    paddingTop: spacing[1],
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
