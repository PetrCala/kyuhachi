import { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { colors, spacing } from '@/theme';

export interface LinePoint {
  x: number;
  y: number;
}

interface LineChartProps {
  /** Points in data space; scaled to fill the measured width. */
  points: LinePoint[];
  height?: number;
  color?: string;
}

const DEFAULT_HEIGHT = spacing[10] * 3; // 120
const PAD = spacing[2];
const STROKE = spacing[1] / 2; // 2
const DOT = spacing[1] / 2 + 1; // 3

/** Linear map of `v` from [a0,a1] into [b0,b1]; midpoint when the domain is flat. */
function scale(v: number, a0: number, a1: number, b0: number, b1: number): number {
  if (a1 === a0) return (b0 + b1) / 2;
  return b0 + ((v - a0) / (a1 - a0)) * (b1 - b0);
}

/**
 * A minimal line chart (the Timeline cumulative curve, and hub sparklines).
 * Measures its own width via onLayout so callers don't have to, and draws in
 * real pixel space so the stroke stays uniform.
 */
export function LineChart({ points, height = DEFAULT_HEIGHT, color }: LineChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  let body = null;
  if (width > 0 && points.length > 0) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys, 0);
    const maxY = Math.max(...ys);
    const stroke = color ?? colors.onsenVisited;

    const projected = points.map((p) => ({
      x: scale(p.x, minX, maxX, PAD, width - PAD),
      y: scale(p.y, minY, maxY, height - PAD, PAD),
    }));
    const last = projected[projected.length - 1];

    body = (
      <Svg width={width} height={height}>
        {projected.length > 1 ? (
          <Polyline
            points={projected.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={stroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        <Circle cx={last.x} cy={last.y} r={DOT} fill={stroke} />
      </Svg>
    );
  }

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
  },
});
