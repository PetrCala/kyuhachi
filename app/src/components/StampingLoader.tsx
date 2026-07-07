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
import Svg, { Path, Polygon, Text as SvgText } from 'react-native-svg';
import { colors, radii, typography } from '@/theme';

/**
 * One full story beat of the loader: the block drops and presses (0–0.20 of the
 * cycle), rests on the page (0.20–0.42), lifts up and away to the side while
 * fading (0.42–0.64), and the inked impression it revealed holds, then fades
 * (0.64–1). Exported so the save flow can hold its overlay open for exactly one
 * complete press (see MIN_SAVE_VISIBLE_MS in edit-visit.tsx).
 */
export const STAMP_PRESS_CYCLE_MS = 1800;

// SVG drawing geometry (runtime drawing values, not layout spacing) — an
// isometric square-prism stamp block, like the commemorative stamp markers at
// the onsens: rectangle from the side, square from below. The impression is
// that square base seen in the same perspective, inked in the brand amber.
const BLOCK_W = 58;
const BLOCK_H = 98;
const IMP_W = 58;
const IMP_H = 36;
const BASE_STROKE = 4;
const IMP_STROKE = 3;
const INK_FONT_SIZE = 12;

// Motion amplitudes, in px of the stage.
const DROP_FROM = -34; // where the block hangs before the press
const LIFT_X = 32; // how far aside it flies after the press
const LIFT_Y = -58; // how far up it flies after the press
const LIFT_TILT_DEG = 12;
const IMPACT_SQUASH = 0.9; // scaleY at the peak of the impact

// The block's faces are the body color at three brightnesses, selling the
// isometric volume without extra color tokens.
const FACE_TOP = 1;
const FACE_RIGHT = 0.88;
const FACE_LEFT = 0.66;

interface StampingLoaderProps {
  /** Tint for the stamp block and the Reduce-Motion fallback spinner. */
  color?: string;
}

/**
 * The "saving your visit" busy animation: an isometric stamp block — the kind
 * waiting on the counter at each onsen — drops onto the page, presses with a
 * little squash as its contact shadow spreads, then a hand seems to pull it up
 * and away, revealing the amber 九八 impression it leaves behind. The seal
 * holds a beat and fades, and the block returns for the next press.
 *
 * Every layer (block, shadow, impression) reads off one repeating Reanimated
 * progress value through interpolation, so the whole story stays in phase on
 * the UI thread. Under Reduce Motion it falls back to the platform spinner —
 * the "Saving…" label still conveys the work.
 */
export function StampingLoader({ color = colors.textInverted }: StampingLoaderProps) {
  // null while the OS setting resolves; the stage sits blank until it does.
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
    // Linear driver; the phase map above shapes the motion through the
    // interpolation stops, with midpoints easing the drop and the lift.
    progress.value = withRepeat(
      withTiming(1, { duration: STAMP_PRESS_CYCLE_MS, easing: Easing.linear }),
      -1
    );
    return () => cancelAnimation(progress);
  }, [reduceMotion, progress]);

  // The block: at full ink from the first frame, presses down, holds, then
  // fades only as it lifts up and aside — press and reveal read as one motion,
  // never a stamp dissolving mid-press. On loop restart it reappears at the
  // hang instantly; the stage is empty then (the impression just faded), so it
  // reads as the next stamp arriving.
  const blockStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.42, 0.64, 1], [1, 1, 0, 0]),
      transform: [
        { translateX: interpolate(p, [0, 0.42, 0.53, 0.64, 1], [0, 0, 12, LIFT_X, LIFT_X]) },
        {
          translateY: interpolate(
            p,
            [0, 0.1, 0.2, 0.42, 0.53, 0.64, 1],
            [DROP_FROM, DROP_FROM * 0.76, 0, 0, LIFT_Y * 0.4, LIFT_Y, LIFT_Y]
          ),
        },
        { rotate: `${interpolate(p, [0, 0.42, 0.64, 1], [0, 0, LIFT_TILT_DEG, LIFT_TILT_DEG])}deg` },
      ],
    };
  });

  // The impact squash, anchored at the block's base (RN scales about the
  // center, so the compensation keeps the bottom edge planted).
  const squashStyle = useAnimatedStyle(() => {
    const s = interpolate(progress.value, [0.19, 0.24, 0.32], [1, IMPACT_SQUASH, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY: ((1 - s) * BLOCK_H) / 2 }, { scaleY: s }] };
  });

  // The revealed seal: pops in under the block as it lifts, holds, then fades
  // out to reset the loop.
  const impressionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.44, 0.54, 0.84, 0.94, 1], [0, 0, 1, 1, 0, 0]),
    transform: [{ scale: interpolate(progress.value, [0.44, 0.54], [0.85, 1], Extrapolation.CLAMP) }],
  }));

  // The contact shadow: spreads on impact, thins as the block leaves.
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.2, 0.42, 0.64, 1], [0.14, 0.4, 0.35, 0.1, 0.1]),
    transform: [
      { scaleX: interpolate(progress.value, [0, 0.2, 0.42, 0.64, 1], [0.55, 1.1, 1, 0.7, 0.6]) },
    ],
  }));

  if (reduceMotion) {
    return <ActivityIndicator size="large" color={color} />;
  }

  return (
    <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.shadow, shadowStyle]} />

      <Animated.View style={[styles.impression, impressionStyle]}>
        <Svg width={IMP_W} height={IMP_H} viewBox={`0 0 ${IMP_W} ${IMP_H}`}>
          <Polygon
            points="4,18 29,32 54,18 29,4"
            fill="none"
            stroke={colors.brandGlyph}
            strokeWidth={IMP_STROKE}
            strokeLinejoin="round"
          />
          {/* The brand glyph, not user-facing copy — matches the seal in Stamp.tsx. */}
          <SvgText
            x={29}
            y={22.5}
            textAnchor="middle"
            fontSize={INK_FONT_SIZE}
            fontWeight={typography.weights.medium}
            fill={colors.brandGlyph}
          >
            九八
          </SvgText>
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.block, blockStyle]}>
        <Animated.View style={squashStyle}>
          <Svg width={BLOCK_W} height={BLOCK_H} viewBox={`0 0 ${BLOCK_W} ${BLOCK_H}`}>
            <Polygon points="4,18 29,32 29,94 4,80" fill={color} fillOpacity={FACE_LEFT} />
            <Polygon points="29,32 54,18 54,80 29,94" fill={color} fillOpacity={FACE_RIGHT} />
            <Polygon points="29,4 54,18 29,32 4,18" fill={color} fillOpacity={FACE_TOP} />
            <Path
              d="M4,80 L29,94 L54,80"
              fill="none"
              stroke={colors.brandGlyph}
              strokeWidth={BASE_STROKE}
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// Room for the drop-in above the block and the fly-off beside it; the block
// overflows the stage while fading out, which iOS leaves unclipped.
const STAGE_W = 120;
const STAGE_H = BLOCK_H + Math.abs(DROP_FROM);

const styles = StyleSheet.create({
  stage: {
    width: STAGE_W,
    height: STAGE_H,
  },
  block: {
    position: 'absolute',
    bottom: 0,
    left: (STAGE_W - BLOCK_W) / 2,
    width: BLOCK_W,
    height: BLOCK_H,
  },
  // Aligned so its rhombus sits where the block's base rests at the press.
  impression: {
    position: 'absolute',
    bottom: 2,
    left: (STAGE_W - IMP_W) / 2,
    width: IMP_W,
    height: IMP_H,
  },
  shadow: {
    position: 'absolute',
    bottom: 1,
    left: (STAGE_W - 52) / 2,
    width: 52,
    height: 11,
    borderRadius: radii.full,
    backgroundColor: colors.actionPrimary,
  },
});
