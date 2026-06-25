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
 * When the hours parsed into a clean weekly grid (`schedule`), it shows a tappable
 * "today" line that expands into the grouped week; otherwise it falls back to the
 * verbatim source text. Schedule exceptions and a low-confidence hint render as
 * captions beneath, and the user can always reveal the original text.
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
      : `${dayShort(days[0])}–${dayShort(days[days.length - 1])}`;
  const todayKey = todayWeekday();
  const todaySlot = schedule ? schedule[todayKey] : null;
  const todayLabel = todaySlot
    ? `${todaySlot.opens}–${todaySlot.closes}`
    : t('onsenDetail.closedToday');

  return (
    <>
      {/* Base hours: the weekly grid when structured, else the raw text. */}
      {schedule ? (
        <>
          <Pressable
            style={styles.hoursTodayRow}
            onPress={() => setShowWeek((v) => !v)}
            accessibilityRole="button"
            hitSlop={spacing[1]}
          >
            <Text style={styles.hoursLabel}>{t('onsenDetail.today')}</Text>
            <Text style={styles.hoursTodayValue} selectable>
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
        <OnsenInfoRow label={t('onsenDetail.labelHours')} value={hours.raw} />
      )}

      {/* Schedule exceptions / irregularities — factual notes, not warnings. */}
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

      {/* Let the user fall back to the verbatim source text. */}
      {schedule && (
        <>
          <Pressable
            style={styles.hoursToggle}
            onPress={() => setShowOriginal((v) => !v)}
            hitSlop={spacing[1]}
          >
            <Text style={styles.hoursToggleText}>
              {showOriginal ? t('onsenDetail.hideOriginal') : t('onsenDetail.showOriginal')}
            </Text>
          </Pressable>
          {showOriginal && (
            <Text style={styles.hoursRaw} selectable>
              {hours.raw}
            </Text>
          )}
        </>
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
  hoursLabel: {
    width: spacing[12] + spacing[8],
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  hoursTodayValue: {
    flex: 1,
    marginLeft: spacing[2],
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: typography.sizes.xl,
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
  hoursToggle: {
    paddingVertical: spacing[2],
  },
  hoursToggleText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.actionPrimary,
  },
  hoursRaw: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: typography.sizes.xl,
    paddingTop: spacing[1],
  },
});
