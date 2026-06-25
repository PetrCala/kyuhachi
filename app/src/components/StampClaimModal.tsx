import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { Stamp } from '@/components/Stamp';
import { colors, radii, shadows, spacing, typography } from '@/theme';

const STAMP_SIZE = 168;
const ENTER_DURATION = 260;
// Near-instant fade when the flourish is off (or Reduce Motion is on).
const INSTANT_DURATION = 110;
const EXIT_DURATION = 200;
const SPARKLE_DURATION = 1100;
// One full pulse of the resting glow (out, then back).
const GLOW_HALF_CYCLE = 1150;
const SPARKLE_COUNT = 16;
// The seal's vertical descent before it lands — height above the page and how
// long the drop takes, accelerating in like a hand pressing down.
const DROP_DISTANCE = STAMP_SIZE * 0.75;
const DROP_DURATION = 240;
// The brief squash on impact: the seal flattens by this fraction, then springs
// back to true. Reads as the rubber stamp deforming as it hits the paper.
const IMPACT_DURATION = 70;
const IMPACT_SQUASH = 0.14;

// Warm onsen-collection palette: brand amber, achievement gold, bath-water blue.
const SPARKLE_COLORS = [colors.brandGlyph, colors.tierGold, colors.onsenVisited];

/** The data needed to ink a freshly-collected stamp. */
export interface StampReward {
  /** kyuhachiId of the visited onsen — identifies the celebration instance. */
  onsenId: string;
  prefecture: string;
  areaName: string;
  name: string;
  /** Visit date in ms — inked beneath the seal. */
  dateMs: number;
}

interface Sparkle {
  angle: number; // radians from center
  distance: number; // px travelled outward
  size: number;
  color: string;
  delay: number; // 0..0.2 — fraction of the burst before this mote flies
}

function buildSparkles(): Sparkle[] {
  const sparkles: Sparkle[] = [];
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    // Even spokes with a little jitter so the burst reads as radial, not a ring.
    const angle = (i / SPARKLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    sparkles.push({
      angle,
      distance: STAMP_SIZE * (0.55 + Math.random() * 0.45),
      size: 5 + Math.random() * 5,
      color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
      delay: Math.random() * 0.2,
    });
  }
  return sparkles;
}

/**
 * The radial sparkle burst that fans out from behind the stamp as it lands. One
 * Animated driver (0 → 1) feeds every mote through interpolation, so the whole
 * burst rides a single native-thread timing — same vanilla-RN approach as
 * Confetti. Purely cosmetic and non-interactive.
 */
function Sparkles({ burst }: { burst: Animated.Value }) {
  const sparkles = useMemo(() => buildSparkles(), []);
  return (
    <View style={styles.sparkleLayer} pointerEvents="none">
      {sparkles.map((s, i) => {
        const translateX = burst.interpolate({
          inputRange: [s.delay, 1],
          outputRange: [0, Math.cos(s.angle) * s.distance],
          extrapolate: 'clamp',
        });
        const translateY = burst.interpolate({
          inputRange: [s.delay, 1],
          outputRange: [0, Math.sin(s.angle) * s.distance],
          extrapolate: 'clamp',
        });
        const opacity = burst.interpolate({
          inputRange: [s.delay, s.delay + 0.1, 0.7, 1],
          outputRange: [0, 1, 1, 0],
          extrapolate: 'clamp',
        });
        const scale = burst.interpolate({
          inputRange: [s.delay, s.delay + 0.2, 1],
          outputRange: [0.2, 1, 0.4],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.sparkle,
              {
                width: s.size,
                height: s.size,
                backgroundColor: s.color,
                opacity,
                transform: [{ translateX }, { translateY }, { scale }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

interface StampClaimModalProps {
  /** Non-null while the celebration is on screen; null dismisses it. */
  reward: StampReward | null;
  /** Honored only when Reduce Motion is off: false makes the stamp appear at once. */
  animationsEnabled: boolean;
  onDismiss: () => void;
}

async function fireHaptic() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics are unavailable on some devices/simulators — non-fatal.
  }
}

/**
 * The stamp-collection celebration: when the user records a new visit, the
 * earned seal drops straight onto a glowing page like a hand-pressed stamp,
 * squashes on impact as the sparkles burst, and waits — held in the middle of
 * the screen until the user taps Collect to add it to their Spaport.
 *
 * Motion is gated twice: the user's "stamp collection animation" preference and
 * the OS Reduce Motion setting. With either off, the stamp simply fades in at
 * once (no drop, glow pulse, or sparkles) and still waits to be claimed — the
 * success haptic always fires, since that's feedback, not motion.
 */
export function StampClaimModal({ reward, animationsEnabled, onDismiss }: StampClaimModalProps) {
  const { t } = useTranslation();
  const visible = reward != null;

  // Backdrop + card opacity (timing); the seal's vertical descent (drop) and the
  // impact squash; the resting glow pulse (loop); the one-shot sparkle burst.
  const fade = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(0)).current;
  const squash = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  // Whether the flourish is playing — gates the glow halo and sparkles out of the
  // tree entirely when motion is off, so no static circle lingers behind the seal.
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let glowLoop: Animated.CompositeAnimation | null = null;

    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      const animate = animationsEnabled && !reduceMotion;
      setAnimating(animate);

      fade.setValue(0);
      drop.setValue(animate ? 0 : 1);
      squash.setValue(0);
      glow.setValue(0);
      burst.setValue(0);

      Animated.timing(fade, {
        toValue: 1,
        duration: animate ? ENTER_DURATION : INSTANT_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      if (!animate) {
        void fireHaptic();
        return;
      }

      // The seal drops straight onto the page, accelerating in. Everything that
      // sells the press — the ka-chunk haptic, the squash, the sparkle burst, and
      // the resting glow — fires at the moment of impact, not before.
      Animated.timing(drop, {
        toValue: 1,
        duration: DROP_DURATION,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || cancelled) return;

        void fireHaptic();

        Animated.timing(burst, {
          toValue: 1,
          duration: SPARKLE_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();

        Animated.sequence([
          Animated.timing(squash, {
            toValue: 1,
            duration: IMPACT_DURATION,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(squash, {
            toValue: 0,
            friction: 4,
            tension: 140,
            useNativeDriver: true,
          }),
        ]).start();

        glowLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(glow, {
              toValue: 1,
              duration: GLOW_HALF_CYCLE,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(glow, {
              toValue: 0,
              duration: GLOW_HALF_CYCLE,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ])
        );
        glowLoop.start();
      });
    });

    return () => {
      cancelled = true;
      glowLoop?.stop();
    };
  }, [visible, animationsEnabled, fade, drop, squash, glow, burst]);

  function handleDismiss() {
    Animated.timing(fade, {
      toValue: 0,
      duration: EXIT_DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  }

  if (!reward) {
    return <Modal visible={false} transparent />;
  }

  const translateY = drop.interpolate({ inputRange: [0, 1], outputRange: [-DROP_DISTANCE, 0] });
  // The impact squash: wider and shorter at the peak, then springs back to true.
  const scaleX = squash.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + IMPACT_SQUASH] });
  const scaleY = squash.interpolate({ inputRange: [0, 1], outputRange: [1, 1 - IMPACT_SQUASH] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.5] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleDismiss}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]} />

      <View style={styles.root} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={t('stampClaim.a11yLabel')}
          style={[styles.card, shadows.lg, { opacity: fade }]}
        >
          <View style={styles.stampWrap}>
            {animating ? (
              <>
                <Animated.View
                  testID="stampGlow"
                  pointerEvents="none"
                  style={[
                    styles.glow,
                    { opacity: glowOpacity, transform: [{ scale: glowScale }] },
                  ]}
                />
                <Sparkles burst={burst} />
              </>
            ) : null}
            <Animated.View style={{ transform: [{ translateY }, { scaleX }, { scaleY }] }}>
              <Stamp
                size={STAMP_SIZE}
                prefecture={reward.prefecture}
                areaName={reward.areaName}
                name={reward.name}
                date={new Date(reward.dateMs)}
              />
            </Animated.View>
          </View>

          <Text style={styles.title}>{t('stampClaim.title')}</Text>
          <Text style={styles.caption}>{t('stampClaim.caption')}</Text>

          <Pressable
            style={({ pressed }) => [styles.collectButton, pressed && styles.collectButtonPressed]}
            onPress={handleDismiss}
            accessibilityRole="button"
          >
            <Text style={styles.collectButtonText}>{t('stampClaim.collect')}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const GLOW_SIZE = STAMP_SIZE * 1.5;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.background,
    borderRadius: radii.xl,
    paddingVertical: spacing[8],
    paddingHorizontal: spacing[6],
    alignItems: 'center',
  },
  stampWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[5],
  },
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.brandGlyph,
  },
  // Full-bleed layer over the stamp from whose center the sparkles fan out.
  sparkleLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: {
    position: 'absolute',
    borderRadius: radii.full,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing[1],
  },
  caption: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  collectButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: spacing[6],
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[8],
  },
  collectButtonPressed: {
    opacity: 0.85,
  },
  collectButtonText: {
    color: colors.actionPrimaryText,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
