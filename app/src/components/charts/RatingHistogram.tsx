import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii } from '@/theme';
import type { HistogramBucket } from '@/lib/stats';

interface RatingHistogramProps {
  buckets: HistogramBucket[];
  /** Bar color (defaults to the visited-onsen accent). */
  color?: string;
}

// Tallest a bar can draw, derived from spacing tokens (runtime layout height).
const BAR_MAX_HEIGHT = spacing[12] + spacing[8]; // 80
const BAR_MIN_HEIGHT = spacing[1] / 2; // 2 — keeps a non-zero bucket visible

/**
 * A 1–10 vertical-bar histogram (overall + sub-rating distributions on the
 * Experience screen). Plain Views scaled to the busiest bucket.
 */
export function RatingHistogram({ buckets, color }: RatingHistogramProps) {
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0);
  return (
    <View style={styles.row}>
      {buckets.map((bucket) => {
        const height =
          bucket.count === 0 || max === 0
            ? 0
            : Math.max(BAR_MIN_HEIGHT, (bucket.count / max) * BAR_MAX_HEIGHT);
        return (
          <View key={bucket.bucket} style={styles.column}>
            <View style={styles.barArea}>
              <View
                style={[styles.bar, { height, backgroundColor: color ?? colors.onsenVisited }]}
              />
            </View>
            <Text style={styles.axisLabel}>{bucket.bucket}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  column: {
    flex: 1,
    alignItems: 'center',
  },
  barArea: {
    height: BAR_MAX_HEIGHT,
    justifyContent: 'flex-end',
  },
  bar: {
    width: spacing[3],
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
  },
  axisLabel: {
    marginTop: spacing[1],
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
  },
});
