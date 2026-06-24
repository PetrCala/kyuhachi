import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, spacing, typography } from '@/theme';

export interface DonutSegment {
  key: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** Large value drawn in the hole (e.g. a total). */
  centerLabel?: string;
  /** Small caption under the center label. */
  centerSubLabel?: string;
}

const DEFAULT_SIZE = spacing[12] * 3; // 144
const DEFAULT_THICKNESS = spacing[4]; // 16

/**
 * A donut/ring chart built from stroke-dash arcs (the transport mix, crowd /
 * company splits). Segments are drawn clockwise from 12 o'clock; an all-zero
 * total renders a single neutral ring.
 */
export function DonutChart({
  segments,
  size = DEFAULT_SIZE,
  thickness = DEFAULT_THICKNESS,
  centerLabel,
  centerSubLabel,
}: DonutChartProps) {
  const radius = (size - thickness) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let offset = 0;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <G origin={`${center}, ${center}`} rotation={-90}>
          {/* Track ring (also the fallback when there's no data). */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.chartTrack}
            strokeWidth={thickness}
            fill="none"
          />
          {total > 0 &&
            segments.map((segment) => {
              if (segment.value <= 0) return null;
              const arc = (segment.value / total) * circumference;
              const circle = (
                <Circle
                  key={segment.key}
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={segment.color}
                  strokeWidth={thickness}
                  fill="none"
                  strokeDasharray={`${arc} ${circumference - arc}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += arc;
              return circle;
            })}
        </G>
      </Svg>
      {centerLabel ? (
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerLabel}>{centerLabel}</Text>
          {centerSubLabel ? <Text style={styles.centerSub}>{centerSubLabel}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  centerSub: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
});
