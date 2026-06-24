import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii } from '@/theme';

export interface StackSegment {
  key: string;
  value: number;
  color: string;
}

export interface StackedRow {
  key: string;
  label: string;
  segments: StackSegment[];
  /** Row total (drives segment proportions and the trailing count). */
  total: number;
}

interface StackedBarsProps {
  rows: StackedRow[];
  emptyText?: string;
}

function segPct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

/**
 * A list of labelled stacked bars — each row split into colored segments by
 * proportion (the per-prefecture transport split). Segment colors are supplied
 * by the caller from `series`.
 */
export function StackedBars({ rows, emptyText }: StackedBarsProps) {
  if (rows.length === 0) {
    return emptyText ? <Text style={styles.empty}>{emptyText}</Text> : null;
  }
  return (
    <View>
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <View style={styles.header}>
            <Text style={styles.label} numberOfLines={1}>
              {row.label}
            </Text>
            <Text style={styles.total}>{row.total}</Text>
          </View>
          <View style={styles.track}>
            {row.segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <View
                  key={s.key}
                  style={{ width: `${segPct(s.value, row.total)}%`, backgroundColor: s.color }}
                />
              ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing[3],
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
  total: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  track: {
    flexDirection: 'row',
    height: spacing[2],
    borderRadius: radii.full,
    backgroundColor: colors.chartTrack,
    overflow: 'hidden',
    marginTop: spacing[2],
  },
  empty: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    paddingVertical: spacing[3],
  },
});
