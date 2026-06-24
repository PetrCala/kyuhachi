import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii } from '@/theme';

export interface CoverageItem {
  key: string;
  label: string;
  /** Filled portion (e.g. onsens visited). */
  visited: number;
  /** Whole (e.g. eligible onsens here). */
  eligible: number;
}

interface CoverageBarProps {
  items: CoverageItem[];
  /** `{{visited}} / {{eligible}}` formatter for the right-aligned count. */
  formatCount: (visited: number, eligible: number) => string;
  emptyText?: string;
}

function fillPct(visited: number, eligible: number): number {
  if (eligible <= 0) return 0;
  return Math.max(0, Math.min(100, (visited / eligible) * 100));
}

/**
 * Per-group coverage: each full-width track represents the group's whole
 * (eligible onsens) and the fill shows how much is done (visited), with the
 * `visited / eligible` count alongside. Used for the geography breakdown.
 */
export function CoverageBar({ items, formatCount, emptyText }: CoverageBarProps) {
  if (items.length === 0) {
    return emptyText ? <Text style={styles.empty}>{emptyText}</Text> : null;
  }
  return (
    <View>
      {items.map((item) => {
        const complete = item.eligible > 0 && item.visited >= item.eligible;
        return (
          <View key={item.key} style={styles.row}>
            <View style={styles.header}>
              <Text style={styles.label} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={[styles.count, complete && styles.countComplete]}>
                {formatCount(item.visited, item.eligible)}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${fillPct(item.visited, item.eligible)}%` }]} />
            </View>
          </View>
        );
      })}
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
  count: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  countComplete: {
    color: colors.onsenVisited,
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
    backgroundColor: colors.onsenVisited,
  },
  empty: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    paddingVertical: spacing[3],
  },
});
