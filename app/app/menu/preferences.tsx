import { ScrollView, View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  usePreferences,
  NEAR_RADIUS_OPTIONS_KM,
  NEAR_ROUTE_RADIUS_OPTIONS_KM,
} from '@/context/PreferencesContext';
import { colors, spacing, typography, radii, shadows } from '@/theme';

/**
 * Preferences screen (pushed from the Menu tab). Controls are organized into
 * grouped sections (iOS-style): a header, a card of label-only rows, and one
 * footnote describing the whole group — so individual rows stay terse.
 */
export default function Preferences() {
  const { t } = useTranslation();
  const {
    showNearby,
    nearRadiusKm,
    showOnsenMapPreview,
    nearRouteRadiusKm,
    animateStampCollect,
    animateProgress,
    setShowNearby,
    setNearRadiusKm,
    setShowOnsenMapPreview,
    setNearRouteRadiusKm,
    setAnimateStampCollect,
    setAnimateProgress,
  } = usePreferences();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('preferences.title'), headerShown: true }} />

      <Text style={styles.sectionHeader}>{t('preferences.listHeader')}</Text>
      <View style={styles.group}>
        <ToggleRow
          label={t('preferences.showNearby')}
          value={showNearby}
          onValueChange={setShowNearby}
        />
        {showNearby ? (
          <>
            <Separator />
            <SegmentedField
              label={t('preferences.radiusTitle')}
              options={NEAR_RADIUS_OPTIONS_KM}
              value={nearRadiusKm}
              onSelect={setNearRadiusKm}
            />
          </>
        ) : null}
      </View>
      <Text style={styles.footnote}>{t('preferences.listFootnote')}</Text>

      <Text style={styles.sectionHeader}>{t('preferences.onsenPageHeader')}</Text>
      <View style={styles.group}>
        <ToggleRow
          label={t('preferences.onsenMapPreview')}
          value={showOnsenMapPreview}
          onValueChange={setShowOnsenMapPreview}
        />
      </View>
      <Text style={styles.footnote}>{t('preferences.onsenPagesFootnote')}</Text>

      <Text style={styles.sectionHeader}>{t('preferences.mapHeader')}</Text>
      <View style={styles.group}>
        <SegmentedField
          label={t('preferences.nearRouteRadiusTitle')}
          options={NEAR_ROUTE_RADIUS_OPTIONS_KM}
          value={nearRouteRadiusKm}
          onSelect={setNearRouteRadiusKm}
        />
      </View>
      <Text style={styles.footnote}>{t('preferences.mapFootnote')}</Text>

      <Text style={styles.sectionHeader}>{t('preferences.animationsHeader')}</Text>
      <View style={styles.group}>
        <ToggleRow
          label={t('preferences.stampCollectAnimation')}
          value={animateStampCollect}
          onValueChange={setAnimateStampCollect}
        />
        <Separator />
        <ToggleRow
          label={t('preferences.progressAnimation')}
          value={animateProgress}
          onValueChange={setAnimateProgress}
        />
      </View>
      <Text style={styles.footnote}>{t('preferences.animationsFootnote')}</Text>
    </ScrollView>
  );
}

/** A bare label + switch row (no inline hint — the group footnote explains it). */
function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.separator, true: colors.actionPrimary }}
      />
    </View>
  );
}

/** A titled segmented radius picker that sits as a row inside a group card. */
function SegmentedField({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: readonly number[];
  value: number;
  onSelect: (km: number) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
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
    </View>
  );
}

/** Inset hairline divider between rows in a group card. */
function Separator() {
  return <View style={styles.separator} />;
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
  sectionHeader: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
    marginTop: spacing[6],
    marginBottom: spacing[2],
    marginLeft: spacing[4],
  },
  footnote: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[2],
    marginHorizontal: spacing[4],
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginLeft: spacing[4],
  },
  field: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  fieldLabel: {
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    marginBottom: spacing[2],
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
