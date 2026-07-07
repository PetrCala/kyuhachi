import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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
import Svg, { Path } from 'react-native-svg';
import { colors, typography } from '@/theme';

// Brand wordmark: 九八 (kyuhachi) set in Klee One. Not a translatable string —
// it's the app's visual identity and renders identically in every locale.
const WORDMARK = '九八';

// SVG drawing geometry (runtime drawing values, not layout spacing) — one
// steam wisp: the gentle S-curve from the ♨ onsen map symbol, stroked with
// round caps so it reads as vapor, not a line.
const WISP_W = 14;
const WISP_H = 30;
const WISP_PATH = 'M7 28 C3 23 11 17 7 12 C4 8 5 4 7 1';
const WISP_STROKE = 2.5;

// The steam stage floats above the wordmark's text box; wisps rise through it
// and may overflow the top while dissipating, which iOS leaves unclipped.
const STEAM_H = 34;
const STEAM_W = 64;

// Motion: one linear cycle drives all three wisps, each sampling it a third of
// a revolution apart, so there is always steam mid-rise and the loop can never
// drift out of phase. A wisp is born low and small, rises while expanding, and
// fades out just before its rebirth — opacity is zero at both ends of the
// cycle, hiding the wrap-around jump.
const CYCLE_MS = 2400;
const WISP_PHASES = [0, 1 / 3, 2 / 3];
const RISE_FROM = 6;
const RISE_TO = -16;
const GROW_FROM = 0.8;
const GROW_TO = 1.12;
// Vapor never reaches full ink; it thins as it climbs.
const STEAM_MAX_OPACITY = 0.85;

/** One wisp's frame for the shared cycle progress, shifted by its phase. */
function wispFrame(p: number, phase: number) {
  'worklet';
  const s = (p + phase) % 1;
  return {
    opacity: interpolate(
      s,
      [0, 0.12, 0.6, 0.9, 1],
      [0, STEAM_MAX_OPACITY, STEAM_MAX_OPACITY * 0.75, 0, 0],
      Extrapolation.CLAMP
    ),
    transform: [
      { translateY: interpolate(s, [0, 1], [RISE_FROM, RISE_TO]) },
      { scale: interpolate(s, [0, 1], [GROW_FROM, GROW_TO]) },
    ],
  };
}

function Wisp() {
  return (
    <Svg width={WISP_W} height={WISP_H} viewBox={`0 0 ${WISP_W} ${WISP_H}`}>
      <Path
        d={WISP_PATH}
        fill="none"
        stroke={colors.textMuted}
        strokeWidth={WISP_STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

interface WordmarkLoaderProps {
  /** Layout-only overrides from the host screen (e.g. margins). */
  style?: StyleProp<ViewStyle>;
}

/**
 * The 九八 wordmark as a loading treatment: the wordmark is the hot spring,
 * and three steam wisps — the ♨ onsen-mark trio, center upright, sides fanned
 * outward — rise from it, expanding and thinning until they dissipate, on a
 * continuous loop for as long as the screen waits. The steam overlays the
 * space above the text without taking layout, and the type mirrors Home's
 * static wordmark, so resolving into the loaded (or empty) state swaps the
 * animation out without any visual jump.
 *
 * Under Reduce Motion no steam renders — just the resting wordmark, with the
 * accompanying spinner (which iOS keeps) still conveying the waiting.
 */
export function WordmarkLoader({ style }: WordmarkLoaderProps) {
  // null while the OS setting resolves; the steam stays unrendered until it
  // does (same pattern as StampingLoader), so a reduced-motion user never
  // sees a frame of vapor before the fallback kicks in.
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
    // Linear driver; the birth/rise/dissipate shape lives in wispFrame's
    // interpolation stops.
    progress.value = withRepeat(withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }), -1);
    return () => cancelAnimation(progress);
  }, [reduceMotion, progress]);

  const centerStyle = useAnimatedStyle(() => wispFrame(progress.value, WISP_PHASES[0]));
  const leftStyle = useAnimatedStyle(() => wispFrame(progress.value, WISP_PHASES[1]));
  const rightStyle = useAnimatedStyle(() => wispFrame(progress.value, WISP_PHASES[2]));

  return (
    <View style={style} accessible accessibilityLabel={WORDMARK}>
      <View>
        <View style={styles.steamStage} pointerEvents="none">
          {reduceMotion === false && (
            <>
              <View style={styles.wispLeft}>
                <Animated.View style={leftStyle}>
                  <Wisp />
                </Animated.View>
              </View>
              <View style={styles.wispCenter}>
                <Animated.View style={centerStyle}>
                  <Wisp />
                </Animated.View>
              </View>
              <View style={styles.wispRight}>
                <Animated.View style={rightStyle}>
                  <Wisp />
                </Animated.View>
              </View>
            </>
          )}
        </View>
        <Text style={styles.wordmark}>{WORDMARK}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Anchored to the wordmark's top edge, floating above it out of layout so
  // the wordmark sits exactly where the static states put it.
  steamStage: {
    position: 'absolute',
    bottom: '100%',
    alignSelf: 'center',
    width: STEAM_W,
    height: STEAM_H,
  },
  // The ♨ arrangement: sides shorter and fanned outward, center upright.
  // Static placement transforms live on these wrappers; the animated rise
  // transform lives on the inner view, so neither overrides the other.
  wispLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    transform: [{ rotate: '-12deg' }, { scale: 0.8 }],
  },
  wispCenter: {
    position: 'absolute',
    bottom: 0,
    left: (STEAM_W - WISP_W) / 2,
  },
  wispRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    transform: [{ rotate: '12deg' }, { scale: 0.8 }],
  },
  // Mirrors Home's static wordmark so the loading state resolves in place.
  wordmark: {
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.xxl,
    color: colors.textPrimary,
  },
});
