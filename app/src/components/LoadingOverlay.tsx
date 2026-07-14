import { StyleSheet, Text, View } from 'react-native';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { colors, radii, shadows, spacing, typography } from '@/theme';

interface LoadingOverlayProps {
  /** While true the overlay covers its positioned parent and blocks all touches. */
  visible: boolean;
  /** Optional caption shown beneath the indicator (e.g. "Saving your visit..."). */
  label?: string;
}

/**
 * A full-bleed blocking overlay for a short in-progress moment. Absolutely fills
 * its nearest positioned parent, dims it behind a scrim, and (because it renders
 * on top with default hit-testing) swallows every touch so the user can't tap
 * away or interact with a half-saved form underneath. The indicator and caption
 * sit on an opaque paper card (the same card language as the celebrations and
 * the route loader) so they stay legible over any form content.
 *
 * The moving part is delegated to {@link LoadingIndicator} so the busy visual can
 * evolve independently of this container. On the paper card it renders in its
 * default dark ink: the stamp block as it actually looks on the counter.
 */
export function LoadingOverlay({ visible, label }: LoadingOverlayProps) {
  if (!visible) return null;
  return (
    <View style={styles.overlay} accessible accessibilityLabel={label}>
      <View style={[styles.card, shadows.lg]}>
        <LoadingIndicator />
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radii.xl,
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[8],
    gap: spacing[3],
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
});
