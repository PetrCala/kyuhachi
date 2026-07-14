import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ParsedHours, WeeklySchedule } from '@kyuhachi/shared';
import { groupSchedule, todayWeekday } from '@/lib/onsen-hours';
import { OnsenInfoRow } from '@/components/OnsenInfoRow';
import { colors, spacing, typography } from '@/theme';

interface OnsenHoursProps {
  /** Parsed hours for the onsen. Callers guard `onsen.businessHours && ...`, so this is non-null. */
  hours: ParsedHours;
}

/**
 * The business-hours block shared by the onsen detail screen and the map-pin
 * preview sheet, so both render the same parsed schedule the same way.
 *
 * When the hours parsed into a clean weekly grid (`schedule`), it shows today's line
 * with two reveal icons: a list icon that expands the grouped week, and a chevron
 * that reveals the verbatim source text, so the collapsed row stays one line and
 * each reveal opens beneath it. This is the same reveal-icon vocabulary as `OnsenFee`.
 * Without a clean grid it falls back to the verbatim text. Schedule exceptions and a
 * low-confidence hint render as always-visible captions beneath.
 */
export function OnsenHours({ hours }: OnsenHoursProps) {
  const { t, i18n } = useTranslation();
  const [showWeek, setShowWeek] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const schedule = hours.schedule;
  const exceptions = hours.exceptions ?? [];
  const confidence = hours.confidence;
  const lang: 'en' | 'ja' = i18n.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';

  const dayShort = (day: keyof WeeklySchedule) => t(`onsenDetail.dayShort.${day}`);
  const dayRange = (days: (keyof WeeklySchedule)[]) =>
    days.length === 1
      ? dayShort(days[0])
      : `${dayShort(days[0])}-${dayShort(days[days.length - 1])}`;
  const todayKey = todayWeekday();
  const todaySlot = schedule ? schedule[todayKey] : null;
  const todayLabel = todaySlot
    ? `${todaySlot.opens}-${todaySlot.closes}`
    : t('onsenDetail.closedToday');

  return (
    <>
      {/* Base hours: today's line with reveal icons when structured, else raw text. */}
      {schedule ? (
        <>
          <View style={styles.hoursTodayRow}>
            {/* Today's line (label and time) toggles the week, so the whole
                opening-times group reads as tappable. */}
            <Pressable
              style={styles.hoursTodayMain}
              onPress={() => setShowWeek((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={t(showWeek ? 'onsenDetail.hideHours' : 'onsenDetail.showHours')}
              hitSlop={spacing[1]}
            >
              <Text style={styles.hoursLabel}>{t('onsenDetail.today')}</Text>
              <Text style={styles.hoursTodayValue}>{todayLabel}</Text>
            </Pressable>
            {/* Reveal icons, grouped on the far edge: the weekly list, then the
                verbatim source text. */}
            <View style={styles.hoursIconsGroup}>
              <Pressable
                onPress={() => setShowWeek((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={t(
                  showWeek ? 'onsenDetail.hideHours' : 'onsenDetail.showHours',
                )}
                hitSlop={spacing[2]}
              >
                <Ionicons
                  name="list-outline"
                  size={typography.sizes.md}
                  color={showWeek ? colors.actionPrimary : colors.textMuted}
                />
              </Pressable>
              <Pressable
                onPress={() => setShowOriginal((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={t(
                  showOriginal ? 'onsenDetail.hideOriginal' : 'onsenDetail.showOriginal',
                )}
                hitSlop={spacing[2]}
              >
                <Ionicons
                  name={showOriginal ? 'chevron-up' : 'chevron-down'}
                  size={typography.sizes.md}
                  color={showOriginal ? colors.actionPrimary : colors.textMuted}
                />
              </Pressable>
            </View>
          </View>
          {showWeek &&
            groupSchedule(schedule).map((g, i) => {
              const isToday = g.days.includes(todayKey);
              return (
                <View key={i} style={styles.dayRow}>
                  <Text style={[styles.dayLabel, isToday && styles.dayToday]} selectable>
                    {dayRange(g.days)}
                  </Text>
                  <Text style={[styles.dayValue, isToday && styles.dayToday]} selectable>
                    {g.slot ? `${g.slot.opens}-${g.slot.closes}` : t('onsenDetail.closed')}
                  </Text>
                </View>
              );
            })}
          {showOriginal && (
            <Text style={styles.hoursRaw} selectable>
              {hours.raw}
            </Text>
          )}
        </>
      ) : (
        <OnsenInfoRow label={t('onsenDetail.labelHours')} value={hours.raw} />
      )}

      {/* Schedule exceptions / irregularities: always-visible factual notes. */}
      {exceptions.map((ex, i) => (
        <View key={i} style={styles.hoursExceptionRow}>
          <Ionicons
            name="calendar-outline"
            size={typography.sizes.sm}
            color={colors.textMuted}
            style={styles.hoursExceptionIcon}
          />
          <Text style={styles.hoursException} selectable>
            {ex[lang] ?? ex.en}
          </Text>
        </View>
      ))}
      {confidence && confidence !== 'high' && (
        <Text style={styles.hoursHint}>{t('onsenDetail.hoursVary')}</Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  hoursTodayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[1],
  },
  hoursTodayMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hoursLabel: {
    width: spacing[12] + spacing[8],
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  hoursTodayValue: {
    marginLeft: spacing[2],
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: typography.sizes.xl,
  },
  hoursIconsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginLeft: 'auto',
  },
  dayRow: {
    flexDirection: 'row',
    paddingVertical: spacing[1],
  },
  dayLabel: {
    width: spacing[12] + spacing[8],
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  dayValue: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  dayToday: {
    color: colors.textPrimary,
    fontWeight: typography.weights.medium,
  },
  hoursExceptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    paddingVertical: spacing[1] / 2,
  },
  hoursExceptionIcon: {
    marginTop: spacing[1] / 2,
  },
  hoursException: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.xl,
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
    lineHeight: typography.sizes.xl,
    paddingTop: spacing[1],
  },
});
