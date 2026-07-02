import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radii, spacing } from '@/theme';

// One full press-and-lift of the stamp. Chosen to read clearly even as a single
// cycle, since the save it covers is held open for about this long (see
// MIN_SAVE_VISIBLE_MS in edit-visit.tsx).
const CYCLE_MS = 1100;
// How far the stamp rises between presses, in px.
const LIFT = 16;

// The whole loop is driven by one shared progress value (0 → 1, repeating). Every
// moving part reads off it through interpolation on the UI thread, so the press,
// the squash, and the ink ring stay perfectly in phase with no JS-thread work.
// Phase map of the cycle:
//   0.00–0.30  the stamp drops onto the paper
//   0.30       impact — squash peaks, ink ring fires
//   0.30–0.50  it rests on the page
//   0.50–0.80  it lifts back up
//   0.80–1.00  a beat at the top before the next press
const PRESS_IN = [0, 0.3, 0.5, 0.8, 1];

interface StampingLoaderProps {
  /** Tint for the stamp body and the Reduce-Motion fallback spinner. */
  color?: string;
}

/**
 * The "saving your visit" busy animation: a rubber stamp that presses onto the
 * page, squashing on impact as an amber ink ring blooms, then lifts and presses
 * again. Built from plain Views (like {@link Stamp} and ChallengeBadge) and
 * driven by Reanimated on the UI thread.
 *
 * It renders on the dark save scrim, so the body uses the passed light `color`
 * with the brand amber as the ink accent. Under Reduce Motion it falls back to
 * the platform spinner — the "Saving…" label still conveys the work.
 */
export function StampingLoader({ color = colors.textInverted }: StampingLoaderProps) {
  // null while the OS setting resolves; the stamp sits static until it does.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const progress = useSharedValue(0);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
      if (active) setReduceMotion(rm);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion !== false) return;
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }), -1);
    return () => cancelAnimation(progress);
  }, [reduceMotion, progress]);

  const stampStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, PRESS_IN, [-LIFT, 0, 0, -LIFT, -LIFT]) }],
  }));

  // The rubber face flattens at the moment of impact, then springs back to true.
  const faceStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleY: interpolate(progress.value, [0.27, 0.32, 0.42], [1, 0.78, 1], Extrapolation.CLAMP) },
      { scaleX: interpolate(progress.value, [0.27, 0.32, 0.42], [1, 1.1, 1], Extrapolation.CLAMP) },
    ],
  }));

  // The impression left on the page: an amber ring that blooms out and fades on
  // each press.
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.3, 0.34, 0.6], [0, 0.5, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(progress.value, [0.3, 0.6], [0.5, 1.5], Extrapolation.CLAMP) }],
  }));

  if (reduceMotion) {
    return <ActivityIndicator size="large" color={color} />;
  }

  return (
    <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.paper, { backgroundColor: color }]} />
      <Animated.View style={[styles.ring, { borderColor: colors.brandGlyph }, ringStyle]} />

      <Animated.View style={[styles.stamp, stampStyle]}>
        <View style={[styles.cap, { backgroundColor: color }]} />
        <View style={[styles.neck, { backgroundColor: color }]} />
        <Animated.View style={[styles.face, { backgroundColor: color }, faceStyle]}>
          <View style={[styles.ink, { borderColor: colors.brandGlyph }]} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const STAGE_W = 84;
const STAGE_H = 96;

const styles = StyleSheet.create({
  stage: {
    width: STAGE_W,
    height: STAGE_H,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  // The page the stamp presses onto.
  paper: {
    position: 'absolute',
    bottom: 14,
    width: 64,
    height: 3,
    borderRadius: radii.full,
    opacity: 0.3,
  },
  ring: {
    position: 'absolute',
    bottom: 16,
    width: 46,
    height: 30,
    borderRadius: radii.md,
    borderWidth: 2,
  },
  // The stamp tool: cap + neck + inked face, dropping as one unit.
  stamp: {
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  cap: {
    width: 24,
    height: 12,
    borderRadius: radii.full,
  },
  neck: {
    width: 13,
    height: 14,
    opacity: 0.85,
  },
  face: {
    width: 48,
    height: 26,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ink: {
    width: 30,
    height: 11,
    borderRadius: radii.sm,
    borderWidth: 1.5,
  },
});
