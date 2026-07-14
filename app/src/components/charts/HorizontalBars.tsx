import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii } from '@/theme';

export interface BarItem {
  key: string;
  /** Left-aligned row label. */
  label: string;
  /** Numeric value driving the bar width. */
  value: number;
  /** Right-aligned formatted value (defaults to the raw number). */
  valueLabel?: string;
  /** Bar fill color (defaults to the visited-onsen accent). */
  color?: string;
  /** Optional muted caption under the bar (e.g. a count). */
  caption?: string;
}

interface HorizontalBarsProps {
  items: BarItem[];
  /** Scale denominator; defaults to the largest item value. */
  max?: number;
  /** Shown when `items` is empty. */
  emptyText?: string;
}

function widthPct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/**
 * A stack of labelled horizontal bars: the workhorse breakdown chart (spend by
 * prefecture, transport mix, area coverage, …). Plain Views; the math is done by
 * the caller, colors come from the theme/`series`.
 */
export function HorizontalBars({ items, max, emptyText }: HorizontalBarsProps) {
  if (items.length === 0) {
    return emptyText ? <Text style={styles.empty}>{emptyText}</Text> : null;
  }
  const scale = max ?? items.reduce((m, item) => Math.max(m, item.value), 0);

  return (
    <View>
      {items.map((item, i) => (
        <View key={item.key} style={[styles.row, i === items.length - 1 && styles.rowLast]}>
          <View style={styles.header}>
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={styles.value}>{item.valueLabel ?? String(item.value)}</Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${widthPct(item.value, scale)}%`, backgroundColor: item.color ?? colors.onsenVisited },
              ]}
            />
          </View>
          {item.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing[3],
  },
  rowLast: {
    paddingBottom: spacing[1],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    marginRight: spacing[3],
  },
  value: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  track: {
    height: spacing[2],
    borderRadius: radii.full,
    backgroundColor: colors.chartTrack,
    overflow: 'hidden',
    marginTop: spacing[2],
  },
  fill: {
    height: '100%',
    borderRadius: radii.full,
  },
  caption: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  empty: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    paddingVertical: spacing[3],
  },
});
