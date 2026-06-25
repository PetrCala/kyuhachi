import { StyleSheet, Text, View } from 'react-native';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { colors, spacing, typography } from '@/theme';

interface LoadingOverlayProps {
  /** While true the overlay covers its positioned parent and blocks all touches. */
  visible: boolean;
  /** Optional caption shown beneath the indicator (e.g. "Saving your visit..."). */
  label?: string;
}

/**
 * A full-bleed blocking overlay for a short in-progress moment. Absolutely fills
 * its nearest positioned parent, dims it behind a scrim, and — because it renders
 * on top with default hit-testing — swallows every touch so the user can't tap
 * away or interact with a half-saved form underneath.
 *
 * The moving part is delegated to {@link LoadingIndicator} so the busy visual can
 * evolve independently of this container.
 */
export function LoadingOverlay({ visible, label }: LoadingOverlayProps) {
  if (!visible) return null;
  return (
    <View style={styles.overlay} accessible accessibilityLabel={label}>
      <LoadingIndicator color={colors.textInverted} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textInverted,
  },
});
