import { useState, type ReactNode } from 'react';
import { ScrollView, View, Text, Pressable, Switch, StyleSheet, LayoutAnimation } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  usePreferences,
  NEAR_RADIUS_OPTIONS_KM,
  NEAR_ROUTE_RADIUS_OPTIONS_KM,
  FINDER_CORRIDOR_OPTIONS_KM,
  FINDER_LOOKAHEAD_OPTIONS_KM,
} from '@/context/PreferencesContext';
import { colors, spacing, typography, radii, shadows } from '@/theme';

/**
 * Preferences screen (pushed from the Menu tab). Settings are grouped into
 * titled sections, each rendered as a single card; a section with more than one
 * setting stacks its rows with hairline separators. Each control shows only its
 * label by default, with the explanation behind a tappable ⓘ so the screen stays
 * scannable. A radius picker whose value only matters while a toggle is on (the
 * "Near you" distance) is revealed inside the same card as that toggle.
 */
export default function Preferences() {
  const { t } = useTranslation();
  const {
    showNearby,
    nearRadiusKm,
    showOnsenMapPreview,
    showReadings,
    nearRouteRadiusKm,
    finderCorridorKm,
    finderLookAheadKm,
    animateStampCollect,
    animateProgress,
    setShowNearby,
    setNearRadiusKm,
    setShowOnsenMapPreview,
    setShowReadings,
    setNearRouteRadiusKm,
    setFinderCorridorKm,
    setFinderLookAheadKm,
    setAnimateStampCollect,
    setAnimateProgress,
  } = usePreferences();

  // Animate the distance row in/out as the toggle reveals/hides it.
  const toggleShowNearby = (value: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowNearby(value);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('preferences.title'), headerShown: true }} />

      <Section title={t('preferences.onsenListHeader')} first>
        <ToggleRowBody
          label={t('preferences.showNearby')}
          hint={t('preferences.showNearbyHint')}
          value={showNearby}
          onValueChange={toggleShowNearby}
        />
        {showNearby ? (
          <>
            <Separator />
            <RadiusRowBody
              label={t('preferences.radiusTitle')}
              hint={t('preferences.radiusHint', { km: nearRadiusKm })}
              options={NEAR_RADIUS_OPTIONS_KM}
              value={nearRadiusKm}
              onSelect={setNearRadiusKm}
            />
          </>
        ) : null}
      </Section>

      <Section title={t('preferences.displayHeader')}>
        <ToggleRowBody
          label={t('preferences.onsenMapPreview')}
          hint={t('preferences.onsenMapPreviewHint')}
          value={showOnsenMapPreview}
          onValueChange={setShowOnsenMapPreview}
        />
        <Separator />
        <ToggleRowBody
          label={t('preferences.showReadings')}
          hint={t('preferences.showReadingsHint')}
          value={showReadings}
          onValueChange={setShowReadings}
        />
      </Section>

      <Section title={t('preferences.mapHeader')}>
        <RadiusRowBody
          label={t('preferences.nearRouteRadiusTitle')}
          hint={t('preferences.nearRouteRadiusHint', { km: nearRouteRadiusKm })}
          options={NEAR_ROUTE_RADIUS_OPTIONS_KM}
          value={nearRouteRadiusKm}
          onSelect={setNearRouteRadiusKm}
        />
      </Section>

      <Section title={t('preferences.finderHeader')}>
        <RadiusRowBody
          label={t('preferences.finderCorridorTitle')}
          hint={t('preferences.finderCorridorHint', { km: finderCorridorKm })}
          options={FINDER_CORRIDOR_OPTIONS_KM}
          value={finderCorridorKm}
          onSelect={setFinderCorridorKm}
        />
        <Separator />
        <RadiusRowBody
          label={t('preferences.finderLookAheadTitle')}
          hint={t('preferences.finderLookAheadHint', { km: finderLookAheadKm })}
          options={FINDER_LOOKAHEAD_OPTIONS_KM}
          value={finderLookAheadKm}
          onSelect={setFinderLookAheadKm}
        />
      </Section>

      <Section title={t('preferences.animationsHeader')}>
        <ToggleRowBody
          label={t('preferences.stampCollectAnimation')}
          hint={t('preferences.stampCollectAnimationHint')}
          value={animateStampCollect}
          onValueChange={setAnimateStampCollect}
        />
        <Separator />
        <ToggleRowBody
          label={t('preferences.progressAnimation')}
          hint={t('preferences.progressAnimationHint')}
          value={animateProgress}
          onValueChange={setAnimateProgress}
        />
      </Section>
    </ScrollView>
  );
}

/**
 * A titled settings section: a muted header above a single card that wraps the
 * section's rows. `first` trims the top margin so the leading header sits near
 * the top of the scroll view instead of below a full section gap.
 */
function Section({
  title,
  first = false,
  children,
}: {
  title: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <Text style={[styles.sectionHeader, first && styles.sectionHeaderFirst]}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </>
  );
}

/** Expand/collapse state for a control's on-tap explanation. */
function useHintToggle() {
  const [open, setOpen] = useState(false);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => !prev);
  };
  return { open, toggle };
}

/** Small ⓘ button that expands/collapses a control's explanation. */
function InfoToggle({ open, onPress, label }: { open: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={spacing[2]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      style={styles.infoButton}
    >
      <Ionicons
        name={open ? 'information-circle' : 'information-circle-outline'}
        size={20}
        color={open ? colors.textSecondary : colors.textMuted}
      />
    </Pressable>
  );
}

/** Inset hairline divider between rows that share a card. */
function Separator() {
  return <View style={styles.separator} />;
}

/** A label + switch row with an on-tap hint, sized to sit inside a section card. */
function ToggleRowBody({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const { open, toggle } = useHintToggle();
  return (
    <>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <InfoToggle open={open} onPress={toggle} label={t('preferences.explain', { label })} />
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.separator, true: colors.actionPrimary }}
        />
      </View>
      {open ? <Text style={styles.cardHint}>{hint}</Text> : null}
    </>
  );
}

/**
 * A titled segmented radius picker with an on-tap hint, sized to sit inside a
 * section card (label + ⓘ on one line, segmented control below).
 */
function RadiusRowBody({
  label,
  hint,
  options,
  value,
  onSelect,
}: {
  label: string;
  hint: string;
  options: readonly number[];
  value: number;
  onSelect: (km: number) => void;
}) {
  const { t } = useTranslation();
  const { open, toggle } = useHintToggle();
  return (
    <>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <InfoToggle open={open} onPress={toggle} label={t('preferences.explain', { label })} />
      </View>
      <View style={styles.segmentedRow}>
        <Segmented options={options} value={value} onSelect={onSelect} />
      </View>
      {open ? <Text style={styles.cardHint}>{hint}</Text> : null}
    </>
  );
}

/** The segmented km selector itself, shared by both radius layouts. */
function Segmented({
  options,
  value,
  onSelect,
}: {
  options: readonly number[];
  value: number;
  onSelect: (km: number) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((km) => {
        const active = km === value;
        return (
          <Pressable
            key={km}
            onPress={() => onSelect(km)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive, active && shadows.sm]}
          >
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{km}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  content: {
    padding: spacing[4],
  },
  group: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  rowLabel: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
  },
  infoButton: {
    paddingHorizontal: spacing[2],
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginLeft: spacing[4],
  },
  sectionHeader: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[6],
    marginBottom: spacing[2],
    marginLeft: spacing[4],
  },
  // The leading header sits near the top of the scroll view (the content padding
  // already supplies the top inset), so it doesn't need a full section gap above.
  sectionHeaderFirst: {
    marginTop: 0,
  },
  cardHint: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  segmentedRow: {
    padding: spacing[3],
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.md,
    padding: spacing[1],
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
    borderRadius: radii.sm,
  },
  segmentActive: {
    backgroundColor: colors.background,
  },
  segmentLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  segmentLabelActive: {
    color: colors.textPrimary,
    fontWeight: typography.weights.semibold,
  },
});
