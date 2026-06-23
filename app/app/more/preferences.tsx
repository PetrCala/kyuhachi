import { ScrollView, View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { usePreferences, NEAR_RADIUS_OPTIONS_KM } from '@/context/PreferencesContext';
import { colors, spacing, typography, radii, shadows } from '@/theme';

/**
 * Preferences screen (pushed from the More tab). Currently just the "Near you"
 * onsen-list controls: a show/hide toggle and a radius picker.
 */
export default function Preferences() {
  const { t } = useTranslation();
  const { showNearby, nearRadiusKm, setShowNearby, setNearRadiusKm } = usePreferences();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('preferences.title'), headerShown: true }} />

      <View style={styles.group}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('preferences.showNearby')}</Text>
          <Switch
            value={showNearby}
            onValueChange={setShowNearby}
            trackColor={{ false: colors.separator, true: colors.actionPrimary }}
          />
        </View>
      </View>
      <Text style={styles.hint}>{t('preferences.showNearbyHint')}</Text>

      {showNearby ? (
        <>
          <Text style={styles.sectionHeader}>{t('preferences.radiusTitle')}</Text>
          <View style={styles.group}>
            <View style={styles.segmentedRow}>
              <View style={styles.segmented}>
                {NEAR_RADIUS_OPTIONS_KM.map((km) => {
                  const active = km === nearRadiusKm;
                  return (
                    <Pressable
                      key={km}
                      onPress={() => setNearRadiusKm(km)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[styles.segment, active && styles.segmentActive, active && shadows.sm]}
                    >
                      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                        {km}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
          <Text style={styles.hint}>{t('preferences.radiusHint', { km: nearRadiusKm })}</Text>
        </>
      ) : null}
    </ScrollView>
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
  sectionHeader: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[6],
    marginBottom: spacing[2],
    marginLeft: spacing[4],
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[2],
    marginHorizontal: spacing[4],
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
