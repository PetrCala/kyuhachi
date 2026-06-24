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
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { OnsenDocument, WeeklySchedule } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS, EMPTY_VISIT_STRUCTURED_DATA } from '@kyuhachi/shared';
import type { VisitFeedItem } from '@/lib/visit-feed';
import { VisitCard } from '@/components/VisitCard';
import { useVisit } from '@/hooks/useVisit';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import { firebaseErrorKey } from '@/lib/firebase-errors';
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
      <Text style={styles.infoLabel}>{label}</Text>
      {onPress ? (
        <Pressable
          style={styles.infoValuePressable}
          onPress={onPress}
          accessibilityRole="button"
          hitSlop={4}
        >
          <Text style={[styles.infoValue, styles.infoValueLink]}>{value}</Text>
        </Pressable>
      ) : (
        <Text style={styles.infoValue}>
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
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [onsen, setOnsen] = useState<OnsenWithId | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoursExpanded, setHoursExpanded] = useState(false);

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

  // Quick one-tap check-in. Creates the visit with empty details (which already
  // counts toward the challenge), then opens the edit modal so the user can fill
  // in details right away. The write hits the local cache synchronously and the
  // visit listener reflects it immediately, so we navigate without awaiting the
  // server round-trip — this keeps the flow instant and works offline. A
  // server-side rejection rolls the write back (the edit modal self-dismisses)
  // and surfaces here.
  function handleMarkVisited() {
    if (!user || !challengeId || !id) return;
    setDoc(
      doc(
        db,
        COLLECTIONS.USERS,
        user.uid,
        SUBCOLLECTIONS.CHALLENGES,
        challengeId,
        SUBCOLLECTIONS.VISITS,
        id
      ),
      {
        visitedAt: serverTimestamp(),
        notes: null,
        photoUrls: [],
        structuredData: { ...EMPTY_VISIT_STRUCTURED_DATA },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    ).catch((error) => {
      Alert.alert(t('common.errorTitle'), t(firebaseErrorKey(error)));
    });
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
  const feedItem: VisitFeedItem | null = visit
    ? {
        onsenId: onsen.id,
        onsenName: onsen.name,
        areaName: onsen.areaName,
        prefecture: onsen.prefecture,
        visit,
      }
    : null;

  return (
    <>
      <Stack.Screen options={{ title: onsen.name, headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {onsen.imageUrl && (
          <Image source={{ uri: onsen.imageUrl }} style={styles.image} resizeMode="cover" />
        )}

        <View style={styles.header}>
          <Text style={styles.name}>{onsen.name}</Text>
          <Text style={styles.area}>
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
            <InfoRow label={t('onsenDetail.labelHours')} value={onsen.businessHours.raw} />
          )}
          {schedule && (
            <>
              <Pressable
                style={styles.hoursToggle}
                onPress={() => setHoursExpanded((v) => !v)}
                hitSlop={4}
              >
                <Text style={styles.hoursToggleText}>
                  {hoursExpanded ? t('onsenDetail.hideHours') : t('onsenDetail.showHours')}
                </Text>
              </Pressable>
              {hoursExpanded &&
                WEEKDAYS.map((day) => {
                  const slot = schedule[day];
                  return (
                    <View key={day} style={styles.dayRow}>
                      <Text style={styles.dayLabel}>{t(`onsenDetail.day.${day}`)}</Text>
                      <Text style={styles.dayValue}>
                        {slot ? `${slot.opens}–${slot.closes}` : t('onsenDetail.closed')}
                      </Text>
                    </View>
                  );
                })}
            </>
          )}
        </View>

        <View style={styles.mapSection}>
          <Pressable style={styles.mapButton} onPress={showOnMap} accessibilityRole="button">
            <Text style={styles.mapButtonText}>{t('onsenDetail.showOnMap')}</Text>
          </Pressable>
        </View>

        {onsen.websiteUrl && (
          <View style={styles.section}>
            <Pressable
              onPress={() => Linking.openURL(onsen.websiteUrl!)}
              accessibilityRole="link"
              hitSlop={4}
            >
              <Text style={styles.websiteLink}>{onsen.websiteUrl}</Text>
            </Pressable>
          </View>
        )}

        {challengeId && !visit && !visitLoading && (
          <View style={styles.visitSection}>
            <Pressable style={styles.visitButton} onPress={handleMarkVisited}>
              <Text style={styles.visitButtonText}>{t('onsenDetail.markVisited')}</Text>
            </Pressable>
          </View>
        )}

        {feedItem && (
          <View style={styles.visitSummarySection}>
            <Text style={styles.visitedHeader}>{t('onsenDetail.visited')}</Text>
            <VisitCard
              item={feedItem}
              hideOnsenHeader
              onEdit={() =>
                router.push({ pathname: '/onsens/edit-visit', params: { id: onsen.id } })
              }
            />
          </View>
        )}
      </ScrollView>
    </>
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
  websiteLink: {
    fontSize: typography.sizes.sm,
    color: colors.actionPrimary,
    textDecorationLine: 'underline',
    paddingVertical: spacing[2],
  },
  mapSection: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  mapButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  mapButtonText: {
    color: colors.actionPrimaryText,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  visitSection: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[6],
    alignItems: 'center',
  },
  visitButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[4],
  },
  visitButtonText: {
    color: colors.actionPrimaryText,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  visitSummarySection: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  visitedHeader: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing[3],
  },
});
