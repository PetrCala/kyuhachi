import type { ComponentProps } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TransportMode } from '@kyuhachi/shared';
import OnsenIcon from '@/components/OnsenIcon';
import { usePreferences } from '@/context/PreferencesContext';
import { formatVisitDate } from '@/lib/format-visit-date';
import { onsenReading } from '@/lib/onsen-name';
import type { VisitFeedItem } from '@/lib/visit-feed';
import { colors, spacing, typography, radii, shadows } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const TRANSPORT_ICONS: Record<TransportMode, IoniconName> = {
  foot: 'walk-outline',
  bicycle: 'bicycle-outline',
  public: 'bus-outline',
  car: 'car-outline',
};

interface VisitCardProps {
  item: VisitFeedItem;
  onPress?: () => void;
  /** Hide the avatar/name/location header: used on the onsen's own detail
   *  screen, where the name is already shown above. The date is kept. */
  hideOnsenHeader?: boolean;
  /** When set, render an "Edit details" affordance in the header. */
  onEdit?: () => void;
  /** Present this as the onsen's own completion card: a tinted, elevated card
   *  led by a "Visited" header with a prefecture stamp instead of a bare date. */
  completed?: boolean;
}

/** One visit rendered as a social-feed card. Each row of detail appears only
 *  when its underlying field is present, so a quick check-in collapses to a
 *  tight header while a richly-logged visit reads like a Strava post. */
export function VisitCard({
  item,
  onPress,
  hideOnsenHeader = false,
  onEdit,
  completed = false,
}: VisitCardProps) {
  const { t, i18n } = useTranslation();
  const { showReadings } = usePreferences();
  const { visit, onsenName, nameKana, nameRomaji, areaName, prefecture } = item;
  // Reading shown under the kanji name: romaji in a non-JP UI, kana in Japanese.
  const reading = onsenReading({ nameRomaji, nameKana, language: i18n.language, showReadings });
  const { rating, transportMode, duration, waterTemp, wouldReturn } = visit.structuredData;

  const photoUrls = visit.photoUrls ?? [];
  const location = [areaName, prefecture].filter(Boolean).join(' · ');
  const dateLabel = formatVisitDate(visit.visitedAt.toDate(), new Date(), t, i18n.language);
  const visitedOn = visit.visitedAt.toDate().toLocaleDateString(i18n.language);
  // First character of the prefecture, inked into the mini stamp (e.g. 大 for
  // 大分県). Falls back to the onsen name's first character if no prefecture.
  const sealMark = [...(prefecture || onsenName || '')][0] ?? '';
  const hasStats =
    rating != null ||
    transportMode != null ||
    duration != null ||
    !!waterTemp ||
    wouldReturn === true;

  return (
    <Pressable
      style={completed ? [styles.card, styles.cardCompleted, shadows.sm] : styles.card}
      onPress={onPress}
    >
      <View style={completed ? styles.completedHeader : styles.header}>
        {completed ? (
          <>
            <View style={styles.completedSeal}>
              <Text style={styles.completedSealMark}>{sealMark}</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.completedTitle}>{t('onsenDetail.visitedCardTitle')}</Text>
              <Text style={styles.completedDate}>
                {t('onsenDetail.visitedCardDate', { date: visitedOn })}
              </Text>
            </View>
          </>
        ) : hideOnsenHeader ? (
          <Text style={styles.compactDate}>{dateLabel}</Text>
        ) : (
          <>
            <View style={styles.avatar}>
              <OnsenIcon color={colors.brandGlyph} size={spacing[5]} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.onsenName} numberOfLines={1}>
                {onsenName}
              </Text>
              {reading ? (
                <Text style={styles.reading} numberOfLines={1}>
                  {reading}
                </Text>
              ) : null}
              {location ? (
                <Text style={styles.location} numberOfLines={1}>
                  {location}
                </Text>
              ) : null}
            </View>
            <Text style={styles.date}>{dateLabel}</Text>
          </>
        )}
        {onEdit ? (
          <Pressable onPress={onEdit} hitSlop={8}>
            <Text style={styles.editLink}>{t('onsenDetail.editDetails')}</Text>
          </Pressable>
        ) : null}
      </View>

      {photoUrls.length > 0 ? (
        <View style={styles.photoWrap}>
          <Image source={{ uri: photoUrls[0] }} style={styles.photo} resizeMode="cover" />
          {photoUrls.length > 1 ? (
            <View style={styles.photoBadge}>
              <Ionicons name="images-outline" size={typography.sizes.xs} color={colors.textInverted} />
              <Text style={styles.photoBadgeText}>{photoUrls.length}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {hasStats ? (
        <View style={styles.chipRow}>
          {rating != null ? (
            <View style={styles.chip}>
              <Text style={styles.star}>★</Text>
              <Text style={styles.chipText}>{rating}</Text>
            </View>
          ) : null}
          {transportMode != null ? (
            <View style={styles.chip}>
              <Ionicons
                name={TRANSPORT_ICONS[transportMode]}
                size={typography.sizes.sm}
                color={colors.textSecondary}
              />
              <Text style={styles.chipText}>{t(`onsenDetail.transport.${transportMode}`)}</Text>
            </View>
          ) : null}
          {duration != null ? (
            <View style={styles.chip}>
              <Ionicons
                name="time-outline"
                size={typography.sizes.sm}
                color={colors.textSecondary}
              />
              <Text style={styles.chipText}>{t('visits.durationMinutes', { count: duration })}</Text>
            </View>
          ) : null}
          {waterTemp ? (
            <View style={styles.chip}>
              <Ionicons
                name="thermometer-outline"
                size={typography.sizes.sm}
                color={colors.textSecondary}
              />
              <Text style={styles.chipText}>{waterTemp}</Text>
            </View>
          ) : null}
          {wouldReturn === true ? (
            <View style={styles.chip}>
              <Ionicons name="heart" size={typography.sizes.sm} color={colors.destructive} />
              <Text style={styles.chipText}>{t('visits.wouldReturn')}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {visit.notes ? (
        <Text style={styles.notes} numberOfLines={3} selectable>
          {visit.notes}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radii.lg,
    padding: spacing[3],
    marginBottom: spacing[3],
    overflow: 'hidden',
  },
  // Completion variant: a tinted, elevated card whose header marks the visit
  // with a stamp, in the muted ink/gray of a stamp book.
  cardCompleted: {
    borderColor: colors.stampFrame,
    backgroundColor: colors.backgroundSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  completedSeal: {
    width: spacing[8],
    height: spacing[8],
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.stampInk,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedSealMark: {
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.lg,
    color: colors.stampInk,
  },
  completedTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  completedDate: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginTop: spacing[1],
  },
  avatar: {
    width: spacing[8],
    height: spacing[8],
    borderRadius: radii.full,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  headerText: {
    flex: 1,
  },
  onsenName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  // Reading under the name (romaji or kana by UI language); omitted when none.
  reading: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  location: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  date: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginLeft: spacing[2],
  },
  compactDate: {
    flex: 1,
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
  },
  editLink: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.actionPrimary,
  },
  photoWrap: {
    position: 'relative',
    marginTop: spacing[3],
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: radii.md,
    backgroundColor: colors.backgroundSecondary,
  },
  photoBadge: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radii.full,
    backgroundColor: colors.overlay,
  },
  photoBadgeText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    color: colors.textInverted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
    marginTop: spacing[3],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  star: {
    fontSize: typography.sizes.sm,
    color: colors.brandGlyph,
  },
  chipText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  notes: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing[3],
  },
});
