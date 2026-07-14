import { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { colors, spacing, typography } from '@/theme';

export interface LinePoint {
  x: number;
  y: number;
}

interface LineChartProps {
  /** Points in data space; scaled to fill the measured width. */
  points: LinePoint[];
  height?: number;
  color?: string;
  /** Formats an x value (e.g. a timestamp) for an axis tick. Provide to show x ticks. */
  xTickFormat?: (value: number) => string;
  /** Formats a y value for an axis tick. Provide to show y ticks (and gridlines). */
  yTickFormat?: (value: number) => string;
}

type XTick = { x: number; label: string; anchor: 'start' | 'middle' | 'end' };

const DEFAULT_HEIGHT = spacing[10] * 3; // 120
const PAD = spacing[2];
const STROKE = spacing[1] / 2; // 2
const DOT = spacing[1] / 2 + 1; // 3
const TICK_FONT = typography.sizes.xs;
const TICK_GAP = spacing[1]; // gap between a tick label and the plot
const Y_AXIS_GUTTER = spacing[8]; // room for y tick numbers (up to 3 digits)
const X_AXIS_BAND = spacing[5]; // room for the x tick date row
const TARGET_Y_TICKS = 4;
const PX_PER_X_TICK = 72; // min horizontal space each date label needs

/** Linear map of `v` from [a0,a1] into [b0,b1]; midpoint when the domain is flat. */
function scale(v: number, a0: number, a1: number, b0: number, b1: number): number {
  if (a1 === a0) return (b0 + b1) / 2;
  return b0 + ((v - a0) / (a1 - a0)) * (b1 - b0);
}

/** A "nice" rounded step and the domain max it implies, so y ticks land on round numbers. */
function niceYAxis(dataMax: number, target: number): { max: number; step: number } {
  if (dataMax <= 0) return { max: 1, step: 1 };
  const rawStep = dataMax / target;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = Math.max(1, Math.round(niceNorm * mag));
  return { max: step * Math.ceil(dataMax / step), step };
}

/**
 * A minimal line chart (the Timeline cumulative curve, and hub sparklines).
 * Measures its own width via onLayout so callers don't have to, and draws in
 * real pixel space so the stroke stays uniform. Pass `xTickFormat`/`yTickFormat`
 * to render dynamically-spaced axis ticks; omit them for a bare sparkline.
 */
export function LineChart({
  points,
  height = DEFAULT_HEIGHT,
  color,
  xTickFormat,
  yTickFormat,
}: LineChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  let body = null;
  if (width > 0 && points.length > 0) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const stroke = color ?? colors.onsenVisited;

    // Reserve gutters for tick labels only when ticks are shown.
    const left = yTickFormat ? Y_AXIS_GUTTER : PAD;
    const bottom = xTickFormat ? X_AXIS_BAND : PAD;
    const plotLeft = left;
    const plotRight = width - PAD;
    const plotTop = PAD;
    const plotBottom = height - bottom;

    // Y domain: snap to the nice tick max when ticks are on, else hug the data.
    const yAxis = yTickFormat ? niceYAxis(Math.max(...ys), TARGET_Y_TICKS) : null;
    const minY = yAxis ? 0 : Math.min(...ys, 0);
    const maxY = yAxis ? yAxis.max : Math.max(...ys);

    const projected = points.map((p) => ({
      x: scale(p.x, minX, maxX, plotLeft, plotRight),
      y: scale(p.y, minY, maxY, plotBottom, plotTop),
    }));
    const last = projected[projected.length - 1];

    // Y ticks: 0, step, 2·step … up to the snapped max.
    const yTicks: number[] = [];
    if (yAxis) {
      for (let v = 0; v <= maxY + 1e-9; v += yAxis.step) yTicks.push(v);
    }

    // X ticks: evenly spaced across the time range. Use the largest count (fit to
    // the width) whose labels are all distinct, so they stay evenly spread instead
    // of collapsing toward one end: a short span just falls back to fewer ticks.
    const xTicks: XTick[] = [];
    if (xTickFormat) {
      const project = (v: number) => scale(v, minX, maxX, plotLeft, plotRight);
      if (maxX === minX) {
        xTicks.push({ x: project(minX), label: xTickFormat(minX), anchor: 'middle' });
      } else {
        const maxCount = Math.max(2, Math.min(5, Math.floor((plotRight - plotLeft) / PX_PER_X_TICK)));
        for (let count = maxCount; count >= 2; count--) {
          const candidate: XTick[] = [];
          const labels = new Set<string>();
          for (let i = 0; i < count; i++) {
            const v = minX + ((maxX - minX) * i) / (count - 1);
            const label = xTickFormat(v);
            labels.add(label);
            candidate.push({
              x: project(v),
              label,
              anchor: i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle',
            });
          }
          if (labels.size === count) {
            xTicks.push(...candidate);
            break;
          }
        }
        // The whole range collapses to a single label (a sub-day span at day
        // granularity): show it once, centered.
        if (xTicks.length === 0) {
          xTicks.push({ x: project((minX + maxX) / 2), label: xTickFormat(minX), anchor: 'middle' });
        }
      }
    }

    body = (
      <Svg width={width} height={height}>
        {yTicks.map((v) => {
          const gy = scale(v, minY, maxY, plotBottom, plotTop);
          return (
            <Line
              key={`grid-${v}`}
              x1={plotLeft}
              y1={gy}
              x2={plotRight}
              y2={gy}
              stroke={colors.chartTrack}
              strokeWidth={1}
            />
          );
        })}
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
        {yTicks.map((v) => (
          <SvgText
            key={`ytick-${v}`}
            x={plotLeft - TICK_GAP}
            y={scale(v, minY, maxY, plotBottom, plotTop) + TICK_FONT * 0.35}
            fill={colors.textMuted}
            fontSize={TICK_FONT}
            textAnchor="end"
          >
            {yTickFormat?.(v)}
          </SvgText>
        ))}
        {xTicks.map((tick) => (
          <SvgText
            key={`xtick-${tick.label}-${tick.x}`}
            x={tick.x}
            y={height - PAD}
            fill={colors.textMuted}
            fontSize={TICK_FONT}
            textAnchor={tick.anchor}
          >
            {tick.label}
          </SvgText>
        ))}
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
