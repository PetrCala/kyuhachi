import { useEffect, useRef, useState } from 'react';
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
import type { TransportMode } from '@kyuhachi/shared';
import { ChallengeBadge } from '@/components/ChallengeBadge';
import { Confetti } from '@/components/Confetti';
import { colors, radii, shadows, spacing, typography } from '@/theme';

const BADGE_SIZE = 150;
const ENTER_DURATION = 280;
const EXIT_DURATION = 200;
const SHINE_DURATION = 900;
const CONFETTI_COUNT = 70;
const CONFETTI_COUNT_FINALE = 130;
// Tilt of the gleam that sweeps across the medallion.
const SHINE_ANGLE = '18deg';

// Tier metal as a readable text/glow accent. Unknown ids fall back to ink.
const TIER_ACCENTS: Record<string, string> = {
  gold: colors.tierGold,
  silver: colors.tierSilver,
  bronze: colors.tierBronze,
};

export interface TierCelebration {
  tierId: string;
  /** Localized tier name (already run through the i18n tier helper). */
  tierName: string;
  transportMode: TransportMode | null;
  /** A first-time claim vs. an upgrade from a lower tier — drives the copy. */
  variant: 'claim' | 'upgrade';
  /** The best tier in the set: gets the finale treatment. */
  isTopTier: boolean;
  /** The next better tier's name, for the "keep going" hint. Null at the top. */
  nextTierName: string | null;
}

interface TierClaimModalProps {
  /** Non-null while the celebration is on screen; null dismisses it. */
  celebration: TierCelebration | null;
  onDismiss: () => void;
}

async function fireHaptics(finale: boolean) {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (finale) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  } catch {
    // Haptics are unavailable on some devices/simulators — non-fatal.
  }
}

/**
 * The tier-claim celebration: a full-screen reveal of the earned medallion that
 * springs in, catches a metal gleam, rains tier-colored confetti, and fires a
 * success haptic — the payoff moment for the one action the whole app builds to.
 *
 * Honors Reduce Motion: under it the modal simply fades in, with no pop, gleam,
 * or confetti (the haptic still fires — that's feedback, not motion).
 */
export function TierClaimModal({ celebration, onDismiss }: TierClaimModalProps) {
  const { t } = useTranslation();
  const visible = celebration != null;

  // Backdrop + card opacity (timing); badge scale (spring, for the pop); the
  // gleam sweep across the medallion.
  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const [confettiOn, setConfettiOn] = useState(false);

  useEffect(() => {
    if (!visible || !celebration) return;
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      setConfettiOn(!reduceMotion);

      fade.setValue(0);
      pop.setValue(reduceMotion ? 1 : 0);
      shine.setValue(0);

      Animated.timing(fade, {
        toValue: 1,
        duration: ENTER_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      if (!reduceMotion) {
        Animated.spring(pop, {
          toValue: 1,
          friction: 6,
          tension: 90,
          useNativeDriver: true,
        }).start();
        Animated.timing(shine, {
          toValue: 1,
          duration: SHINE_DURATION,
          delay: ENTER_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }

      void fireHaptics(celebration.isTopTier);
    });

    return () => {
      cancelled = true;
    };
  }, [visible, celebration, fade, pop, shine]);

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

  if (!celebration) {
    return <Modal visible={false} transparent />;
  }

  const accent = TIER_ACCENTS[celebration.tierId] ?? colors.textPrimary;

  const title = celebration.isTopTier
    ? t('tierClaim.finaleTitle')
    : celebration.variant === 'upgrade'
      ? t('tierClaim.upgradedTitle')
      : t('tierClaim.earnedTitle');

  const caption = celebration.isTopTier
    ? t('tierClaim.finaleCaption')
    : celebration.variant === 'upgrade'
      ? t('tierClaim.upgradeCaption', { tier: celebration.tierName })
      : t('tierClaim.caption');

  const showNext = !celebration.isTopTier && celebration.nextTierName;

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const shineX = shine.interpolate({
    inputRange: [0, 1],
    outputRange: [-BADGE_SIZE, BADGE_SIZE],
  });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleDismiss}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]} />

      <View style={styles.root} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={t('tierClaim.a11yLabel')}
          style={[styles.card, shadows.lg, { opacity: fade }]}
        >
          <View style={styles.badgeWrap}>
            <View style={[styles.glowOuter, { backgroundColor: accent }]} pointerEvents="none" />
            <View style={[styles.glowInner, { backgroundColor: accent }]} pointerEvents="none" />
            <Animated.View style={{ transform: [{ scale }] }}>
              <ChallengeBadge
                tierId={celebration.tierId}
                transportMode={celebration.transportMode}
                size={BADGE_SIZE}
                accessibilityLabel={celebration.tierName}
              />
              <View style={styles.shineClip} pointerEvents="none">
                <Animated.View
                  style={[styles.shineBar, { transform: [{ rotate: SHINE_ANGLE }, { translateX: shineX }] }]}
                />
              </View>
            </Animated.View>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={[styles.tierName, { color: accent }]}>{celebration.tierName}</Text>
          <Text style={styles.caption}>{caption}</Text>
          {showNext ? (
            <Text style={styles.nextHint}>
              {t('tierClaim.nextHint', { tier: celebration.nextTierName })}
            </Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.doneButton, pressed && styles.doneButtonPressed]}
            onPress={handleDismiss}
          >
            <Text style={styles.doneButtonText}>{t('tierClaim.done')}</Text>
          </Pressable>
        </Animated.View>
      </View>

      {confettiOn ? (
        <Confetti count={celebration.isTopTier ? CONFETTI_COUNT_FINALE : CONFETTI_COUNT} />
      ) : null}
    </Modal>
  );
}

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
  badgeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[5],
  },
  glowOuter: {
    position: 'absolute',
    width: BADGE_SIZE * 1.7,
    height: BADGE_SIZE * 1.7,
    borderRadius: radii.full,
    opacity: 0.1,
  },
  glowInner: {
    position: 'absolute',
    width: BADGE_SIZE * 1.25,
    height: BADGE_SIZE * 1.25,
    borderRadius: radii.full,
    opacity: 0.16,
  },
  shineClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  shineBar: {
    position: 'absolute',
    top: -BADGE_SIZE * 0.3,
    width: BADGE_SIZE * 0.3,
    height: BADGE_SIZE * 1.6,
    backgroundColor: colors.textInverted,
    opacity: 0.4,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing[1],
  },
  tierName: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  caption: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  nextHint: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing[3],
  },
  doneButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: spacing[6],
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[8],
  },
  doneButtonPressed: {
    opacity: 0.85,
  },
  doneButtonText: {
    color: colors.actionPrimaryText,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
