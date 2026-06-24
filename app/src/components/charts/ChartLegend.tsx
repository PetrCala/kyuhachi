import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii } from '@/theme';

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  /** Optional right-aligned value (e.g. a count or percentage). */
  value?: string;
}

interface ChartLegendProps {
  items: LegendItem[];
}

/** A swatch · label · value list that accompanies a DonutChart. */
export function ChartLegend({ items }: ChartLegendProps) {
  return (
    <View style={styles.container}>
      {items.map((item) => (
        <View key={item.key} style={styles.row}>
          <View style={[styles.swatch, { backgroundColor: item.color }]} />
          <Text style={styles.label} numberOfLines={1}>
            {item.label}
          </Text>
          {item.value ? <Text style={styles.value}>{item.value}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatch: {
    width: spacing[3],
    height: spacing[3],
    borderRadius: radii.sm,
    marginRight: spacing[2],
  },
  label: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  value: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginLeft: spacing[2],
  },
});
