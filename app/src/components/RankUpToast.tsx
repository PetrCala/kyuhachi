import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { colors, radii, shadows, spacing, typography } from '@/theme';

const ENTER_DURATION = 240;
const EXIT_DURATION = 180;
// How long the banner lingers before sliding away on its own.
const VISIBLE_MS = 3800;

export interface RankToast {
  /** Localized name of the rank just reached. */
  rankName: string;
}

interface RankUpToastProps {
  /** Non-null shows the banner; the toast auto-dismisses or can be tapped. */
  toast: RankToast | null;
  /** Clears the parent's toast state once the banner has left the screen. */
  onDismiss: () => void;
  /** Tapping the banner: open the rank detail screen. */
  onPress: () => void;
}

async function fireHaptic() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics are unavailable on some devices/simulators; non-fatal.
  }
}

/**
 * A lightweight top banner announcing a new rank. It slides in, fires a soft
 * haptic, lingers a few seconds, then slides away, non-blocking unlike the
 * full-screen tier celebration. Tapping it opens the rank ladder. Honors Reduce
 * Motion by fading without the slide.
 */
export function RankUpToast({ toast, onDismiss, onPress }: RankUpToastProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [content, setContent] = useState<RankToast | null>(toast);
  const [reduceMotion, setReduceMotion] = useState(false);

  function clearTimer() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function animateOut(after?: () => void) {
    clearTimer();
    Animated.timing(anim, {
      toValue: 0,
      duration: EXIT_DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setContent(null);
      after?.();
      onDismiss();
    });
  }

  useEffect(() => {
    if (!toast) return;
    let cancelled = false;
    setContent(toast);
    void fireHaptic();

    AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
      if (cancelled) return;
      setReduceMotion(rm);
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: ENTER_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });

    clearTimer();
    timer.current = setTimeout(() => animateOut(), VISIBLE_MS);

    return () => {
      cancelled = true;
      clearTimer();
    };
    // Re-run only when a new toast arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  if (!content) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: insets.top + spacing[2],
          opacity: anim,
          transform: reduceMotion ? [] : [{ translateY }],
        },
      ]}
    >
      <Pressable
        style={[styles.toast, shadows.md]}
        onPress={() => animateOut(onPress)}
        accessibilityRole="button"
        accessibilityLabel={`${t('challengeRank.toastTitle')} ${content.rankName}`}
      >
        <View style={styles.textWrap}>
          <Text style={styles.title}>{t('challengeRank.toastTitle')}</Text>
          <Text style={styles.rankName}>{content.rankName}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing[4],
    zIndex: 100,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.lg,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  textWrap: {
    flex: 1,
    marginRight: spacing[3],
  },
  title: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.textInverted,
    opacity: 0.7,
  },
  rankName: {
    marginTop: spacing[1],
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textInverted,
  },
  chevron: {
    fontSize: typography.sizes.xl,
    color: colors.textInverted,
    opacity: 0.7,
  },
});
