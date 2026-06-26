import { useEffect, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography, radii, shadows } from '@/theme';

// Reanimated drives the SVG props on the UI thread via useAnimatedProps, so the
// trace stays smooth even on low-end devices (the old Animated path ran on the
// JS thread because svg props can't use the native driver).
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
  /** When provided, tapping anywhere on the overlay skips the dwell and runs
   *  this immediately (e.g. jump straight to the map). A faint hint is shown. */
  onSkip?: () => void;
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
  // Guarantee strict monotonicity for the interpolate() inputRange.
  for (let i = 1; i < frac.length; i++) {
    if (frac[i] <= frac[i - 1]) frac[i] = frac[i - 1] + 1e-6;
  }

  const d = `M ${pts.map((p) => `${round(p.x)} ${round(p.y)}`).join(' L ')}`;
  return { d, length, frac, xs: pts.map((p) => p.x), ys: pts.map((p) => p.y) };
}

export default function RouteDrawLoader({ name, points, onSkip }: Props) {
  const { t } = useTranslation();
  const progress = useSharedValue(0);
  const geom = useMemo(() => projectTrack(points), [points]);

  useEffect(() => {
    progress.value = 0;
    // Match the old Animated.timing exactly: same duration and its default
    // Easing.inOut(Easing.ease) curve. ReduceMotion.Never preserves the
    // original always-animate behavior (RN's Animated didn't honor it either).
    progress.value = withTiming(1, {
      duration: ROUTE_DRAW_MS,
      easing: Easing.inOut(Easing.ease),
      reduceMotion: ReduceMotion.Never,
    });
  }, [progress, geom]);

  // The line trace: walk strokeDashoffset from the full length down to 0.
  const pathProps = useAnimatedProps(() => {
    'worklet';
    return {
      strokeDashoffset: geom ? interpolate(progress.value, [0, 1], [geom.length, 0]) : 0,
    };
  });

  // The pen: interpolate its position along the path by cumulative arc fraction.
  const penProps = useAnimatedProps(() => {
    'worklet';
    if (!geom) return { cx: 0, cy: 0 };
    return {
      cx: interpolate(progress.value, geom.frac, geom.xs),
      cy: interpolate(progress.value, geom.frac, geom.ys),
    };
  });

  return (
    <Pressable
      style={styles.overlay}
      onPress={onSkip}
      accessibilityRole={onSkip ? 'button' : undefined}
      accessibilityLabel={onSkip ? t('routes.tapToSkip') : undefined}
    >
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
              animatedProps={pathProps}
            />
            <AnimatedCircle r={PEN_RADIUS} fill={colors.brandGlyph} animatedProps={penProps} />
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
        {onSkip ? <Text style={styles.skipHint}>{t('routes.tapToSkip')}</Text> : null}
      </View>
    </Pressable>
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
  skipHint: {
    marginTop: spacing[3],
    fontSize: typography.sizes.xs,
    color: colors.textPlaceholder,
  },
});
