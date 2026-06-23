import { useEffect, useMemo, useRef } from 'react';
import { View, Text, Animated, ActivityIndicator, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography, radii, shadows } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// SVG drawing geometry (runtime drawing values, not layout spacing).
const CANVAS = 220;
const INSET = 18;
const STROKE = 4;
const PEN_RADIUS = 6;

// How long the trace takes. The picker keeps the overlay up a touch longer
// (ROUTE_DRAW_DWELL_MS in routes/index.tsx) so the line finishes before we navigate.
export const ROUTE_DRAW_MS = 1100;

interface Props {
  name: string;
  points: { lat: number; lng: number }[];
}

interface Geom {
  d: string;
  length: number;
  frac: number[];
  xs: number[];
  ys: number[];
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Project the lat/lng track into the square canvas: equirectangular with a
// cos(lat) longitude correction so short tracks keep their real proportions,
// scaled uniformly to fit the inset area, and vertically flipped (screen y grows
// downward, latitude grows upward). Returns null for degenerate tracks.
function projectTrack(points: { lat: number; lng: number }[]): Geom | null {
  if (!points || points.length < 2) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  const lngScale = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * lngScale, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const inner = CANVAS - INSET * 2;
  const scale = Math.min(inner / spanX, inner / spanY);
  const offX = (CANVAS - spanX * scale) / 2;
  const offY = (CANVAS - spanY * scale) / 2;

  // Project + drop consecutive duplicates so the dash length and the pen's
  // interpolation input stay strictly increasing.
  const pts: { x: number; y: number }[] = [];
  for (const p of points) {
    const x = offX + (p.lng - minLng) * lngScale * scale;
    const y = offY + (maxLat - p.lat) * scale;
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last.x - x) > 1e-3 || Math.abs(last.y - y) > 1e-3) {
      pts.push({ x, y });
    }
  }
  if (pts.length < 2) return null;

  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const length = cum[cum.length - 1];
  if (length <= 0) return null;

  const frac = cum.map((c) => c / length);
  // Guarantee strict monotonicity for Animated.interpolate's inputRange.
  for (let i = 1; i < frac.length; i++) {
    if (frac[i] <= frac[i - 1]) frac[i] = frac[i - 1] + 1e-6;
  }

  const d = `M ${pts.map((p) => `${round(p.x)} ${round(p.y)}`).join(' L ')}`;
  return { d, length, frac, xs: pts.map((p) => p.x), ys: pts.map((p) => p.y) };
}

export default function RouteDrawLoader({ name, points }: Props) {
  const { t } = useTranslation();
  const progress = useRef(new Animated.Value(0)).current;
  const geom = useMemo(() => projectTrack(points), [points]);

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: ROUTE_DRAW_MS,
      useNativeDriver: false, // svg props can't run on the native driver
    }).start();
  }, [progress, geom]);

  return (
    <View style={styles.overlay}>
      <View style={[styles.card, shadows.lg]}>
        {geom ? (
          <Svg width={CANVAS} height={CANVAS} viewBox={`0 0 ${CANVAS} ${CANVAS}`}>
            <Path
              d={geom.d}
              stroke={colors.actionPrimary}
              strokeOpacity={0.12}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <AnimatedPath
              d={geom.d}
              stroke={colors.actionPrimary}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={geom.length}
              // Animated.interpolate yields an AnimatedNode; the svg prop types
              // only accept number, so cast each interpolation narrowly.
              strokeDashoffset={
                progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [geom.length, 0],
                }) as unknown as number
              }
            />
            <AnimatedCircle
              r={PEN_RADIUS}
              fill={colors.brandGlyph}
              cx={
                progress.interpolate({
                  inputRange: geom.frac,
                  outputRange: geom.xs,
                }) as unknown as number
              }
              cy={
                progress.interpolate({
                  inputRange: geom.frac,
                  outputRange: geom.ys,
                }) as unknown as number
              }
            />
          </Svg>
        ) : (
          <View style={styles.fallback}>
            <ActivityIndicator />
          </View>
        )}
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.caption}>{t('routes.drawingRoute')}</Text>
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
    zIndex: 10,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radii.xl,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[6],
    alignItems: 'center',
  },
  fallback: {
    width: CANVAS,
    height: CANVAS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: spacing[4],
    maxWidth: CANVAS,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  caption: {
    marginTop: spacing[1],
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
});
