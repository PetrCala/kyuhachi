import type { ComponentProps } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TransportMode } from '@kyuhachi/shared';
import OnsenIcon from '@/components/OnsenIcon';
import { formatVisitDate } from '@/lib/format-visit-date';
import type { VisitFeedItem } from '@/lib/visit-feed';
import { colors, spacing, typography, radii } from '@/theme';

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
  /** Hide the avatar/name/location header — used on the onsen's own detail
   *  screen, where the name is already shown above. The date is kept. */
  hideOnsenHeader?: boolean;
  /** When set, render an "Edit details" affordance in the header. */
  onEdit?: () => void;
}

/** One visit rendered as a social-feed card. Each row of detail appears only
 *  when its underlying field is present, so a quick check-in collapses to a
 *  tight header while a richly-logged visit reads like a Strava post. */
export function VisitCard({ item, onPress, hideOnsenHeader = false, onEdit }: VisitCardProps) {
  const { t, i18n } = useTranslation();
  const { visit, onsenName, areaName, prefecture } = item;
  const { rating, transportMode, duration, waterTemp } = visit.structuredData;

  const location = [areaName, prefecture].filter(Boolean).join(' · ');
  const dateLabel = formatVisitDate(visit.visitedAt.toDate(), new Date(), t, i18n.language);
  const hasStats = rating != null || transportMode != null || duration != null || !!waterTemp;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        {hideOnsenHeader ? (
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

      {visit.photoUrl ? (
        <Image source={{ uri: visit.photoUrl }} style={styles.photo} resizeMode="cover" />
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
        </View>
      ) : null}

      {visit.notes ? (
        <Text style={styles.notes} numberOfLines={3}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  photo: {
    width: '100%',
    aspectRatio: 3 / 2,
    borderRadius: radii.md,
    marginTop: spacing[3],
    backgroundColor: colors.backgroundSecondary,
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
