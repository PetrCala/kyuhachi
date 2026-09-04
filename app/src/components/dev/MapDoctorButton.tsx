import { useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows, spacing } from '@/theme';

interface MapDoctorButtonProps {
  /** Builds the state report shown in the alert (see lib/dev/map-doctor). */
  buildReport: () => Promise<string>;
  /** Re-sets the current camera: the MapKit "wake up" workaround. */
  onNudge: () => void;
  /** Tears the MapView down and mounts a fresh one at the same region. */
  onRemount: () => void;
}

/**
 * Dev-tools-only affordance on the map screen for the intermittent map freeze.
 * Tapping it dumps the map's state into an alert and offers the two recovery
 * actions; whichever one revives a frozen map names the layer at fault (a
 * camera nudge points at MapKit's gesture/camera state, a remount at anything
 * the old native view was carrying). Deliberately outside the auto-hiding
 * controls so it stays reachable while the map itself is unresponsive, and
 * untranslated like the rest of the dev tools.
 */
export default function MapDoctorButton({ buildReport, onNudge, onRemount }: MapDoctorButtonProps) {
  const [busy, setBusy] = useState(false);

  async function handlePress() {
    if (busy) return;
    setBusy(true);
    let report: string;
    try {
      report = await buildReport();
    } catch (error) {
      report = `report failed: ${String(error)}`;
    } finally {
      setBusy(false);
    }
    console.log(`[map doctor]\n${report}`);
    Alert.alert('Map doctor', report, [
      { text: 'Nudge camera', onPress: onNudge },
      { text: 'Remount map', style: 'destructive', onPress: onRemount },
      { text: 'Close', style: 'cancel' },
    ]);
  }

  return (
    <Pressable
      style={[styles.button, shadows.md]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Map doctor"
      disabled={busy}
    >
      <Ionicons name="medkit-outline" size={spacing[5]} color={colors.actionPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: spacing[10],
    height: spacing[10],
    borderRadius: radii.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
