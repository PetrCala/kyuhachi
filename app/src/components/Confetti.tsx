import { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

// A purely cosmetic confetti burst. One Animated driver (0 → 1) fans out to
// every piece through interpolation, so the whole shower runs off a single
// timing animation rather than N. No external library: this keeps the
// vanilla-RN footprint the project mandates and lets the pieces use the exact
// tier-metal palette.
//
// The driver uses the JS driver (useNativeDriver: false). Confetti renders
// inside TierClaimModal's <Modal>, and under the New Architecture the native
// animation driver doesn't reliably bind to views inside a Modal's detached
// surface — native-driven, the pieces never animated. See StampClaimModal for
// the same constraint.

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// The three tier metals plus the brand amber — a Kyushu-88 confetti palette.
const CONFETTI_COLORS = [
  colors.tierGold,
  colors.tierSilver,
  colors.tierBronze,
  colors.brandGlyph,
];

const FALL_DURATION = 2600; // ms for the slowest piece to clear the screen
const PIECE_MIN_SIZE = 7;
const PIECE_SIZE_RANGE = 7;
const MAX_STAGGER = 0.3; // pieces start spread across the first 30% of the driver

interface Piece {
  leftPct: number; // horizontal start, fraction of screen width
  color: string;
  size: number; // longer edge in px (pieces are thin rectangles)
  delay: number; // 0..MAX_STAGGER — fraction of the driver before this piece falls
  drift: number; // horizontal px travel during the fall
  spins: number; // full rotations during the fall
  fall: number; // vertical px travel
}

function buildPieces(count: number): Piece[] {
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    pieces.push({
      leftPct: Math.random(),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: PIECE_MIN_SIZE + Math.random() * PIECE_SIZE_RANGE,
      delay: Math.random() * MAX_STAGGER,
      drift: (Math.random() - 0.5) * 120,
      spins: 1 + Math.random() * 3,
      fall: SCREEN_HEIGHT * (0.85 + Math.random() * 0.35),
    });
  }
  return pieces;
}

interface ConfettiProps {
  /** How many pieces to render. */
  count?: number;
}

/**
 * A one-shot confetti shower covering the screen. Mount it to fire; unmount to
 * clear. Non-interactive (pointerEvents none) so it never intercepts taps.
 */
export function Confetti({ count = 70 }: ConfettiProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(() => buildPieces(count), [count]);

  useEffect(() => {
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: FALL_DURATION,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, count]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece, index) => {
        const translateY = progress.interpolate({
          inputRange: [piece.delay, 1],
          outputRange: [-30, piece.fall],
          extrapolate: 'clamp',
        });
        const translateX = progress.interpolate({
          inputRange: [piece.delay, 1],
          outputRange: [0, piece.drift],
          extrapolate: 'clamp',
        });
        const rotate = progress.interpolate({
          inputRange: [piece.delay, 1],
          outputRange: ['0deg', `${piece.spins * 360}deg`],
          extrapolate: 'clamp',
        });
        const opacity = progress.interpolate({
          inputRange: [piece.delay, piece.delay + 0.04, 0.75, 1],
          outputRange: [0, 1, 1, 0],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={index}
            style={[
              styles.piece,
              {
                left: piece.leftPct * SCREEN_WIDTH,
                width: piece.size,
                height: piece.size * 0.6,
                backgroundColor: piece.color,
                opacity,
                transform: [{ translateY }, { translateX }, { rotate }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    top: 0,
  },
});
