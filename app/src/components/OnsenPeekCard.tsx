import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radii, shadows } from '@/theme';

/** Fixed thumbnail edge — a layout dimension (square image), not on the type scale. */
const THUMB_SIZE = 64;
/** Close-glyph size — a tap-target dimension, not part of the type scale. */
const DISMISS_ICON_SIZE = 18;
/** How far below its resting place the card sits while hidden, so the slide is
 *  always fully off the bottom regardless of the card's measured height. */
const SLIDE_DISTANCE = 160;
const ENTER_DURATION = 240;
const EXIT_DURATION = 180;
/** Quick cross-fade when the card's content swaps to a different onsen in place. */
const SWAP_DURATION = 140;

/** The onsen fields the card renders. A subset of OnsenDocument plus the id, kept
 *  minimal so the parent can pass exactly what it has without coupling. */
export interface PeekOnsen {
  id: string;
  name: string;
  areaName: string;
  prefecture: string;
  admissionFee: string | null;
  imageUrl: string | null;
}

interface OnsenPeekCardProps {
  /** The onsen to peek, or null to dismiss the card. */
  onsen: PeekOnsen | null;
  /** Whether this onsen is visited in the active challenge → shows a check line. */
  visited: boolean;
  /** Tapping the card body (the "enlarge" action) — opens the onsen detail. */
  onOpen: (id: string) => void;
  /** Tapping the × — closes the card without navigating. */
  onDismiss: () => void;
}

/**
 * An Apple/Google-Maps-style place card that floats above the bottom of the map
 * WITHOUT a backdrop, so the map underneath stays fully pannable. The whole card
 * is tappable (opens the detail screen); a small × dismisses it.
 *
 * It is rendered inside a small, bottom-pinned `pointerEvents="box-none"` wrapper
 * by the map screen — never a full-screen overlay — so it never covers the map's
 * central pannable area (see the gesture warning in map.tsx).
 *
 * The card keeps mounting through its exit animation: the parent's `onsen` drops
 * to null, the card slides down, and only then does it unmount itself. While it
 * stays presented, swapping to a different onsen cross-fades the content in place
 * (a lightweight Animated sequence, mirroring RowActionsButton's approach).
 */
export default function OnsenPeekCard({
  onsen,
  visited,
  onOpen,
  onDismiss,
}: OnsenPeekCardProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // The onsen actually drawn. Held independently of the prop so the card can keep
  // rendering its last content while sliding out after `onsen` goes null.
  const [shown, setShown] = useState<PeekOnsen | null>(onsen);
  // 0 = off-screen (slid down), 1 = resting in place.
  const slide = useRef(new Animated.Value(0)).current;
  // 1 = content fully visible; dips toward 0 mid-swap for the cross-fade.
  const contentOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (onsen) {
      const swapping = shown !== null && shown.id !== onsen.id;
      if (swapping) {
        // Already presented on a different onsen: dip the content out, swap it,
        // then bring it back — the card itself stays put.
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: SWAP_DURATION,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!finished) return;
          setShown(onsen);
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: SWAP_DURATION,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
        });
      } else {
        // First present (or re-present of the same onsen): show content, slide up.
        setShown(onsen);
        contentOpacity.setValue(1);
        Animated.timing(slide, {
          toValue: 1,
          duration: ENTER_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
    } else if (shown) {
      // Dismissed: slide down, then drop the last content so the card unmounts.
      Animated.timing(slide, {
        toValue: 0,
        duration: EXIT_DURATION,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShown(null);
      });
    }
    // `shown` is read but intentionally not a dependency: it is this effect's own
    // output, and reacting to it would re-fire the animation on each swap step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onsen, slide, contentOpacity]);

  if (!shown) return null;

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [SLIDE_DISTANCE, 0],
  });

  // Fee shows when present; otherwise the visited check (if visited) stands alone
  // on the third line. When neither applies the line is omitted entirely.
  const feeText = shown.admissionFee;
  const showMeta = !!feeText || visited;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { paddingBottom: insets.bottom + spacing[2], transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      <Animated.View style={{ opacity: contentOpacity }}>
        <Pressable
          style={[styles.card, shadows.lg]}
          onPress={() => onOpen(shown.id)}
          accessibilityRole="button"
          accessibilityLabel={t('onsenPreview.openLabel', { name: shown.name })}
        >
          {shown.imageUrl ? (
            <Image source={{ uri: shown.imageUrl }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="water-outline" size={spacing[6]} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={1}>
              {shown.name}
            </Text>
            <Text style={styles.area} numberOfLines={1}>
              {shown.areaName}　{shown.prefecture}
            </Text>
            {showMeta && (
              <View style={styles.metaRow}>
                {feeText && (
                  <Text style={styles.fee} numberOfLines={1}>
                    {feeText}
                  </Text>
                )}
                {visited && (
                  <View style={styles.visitedTag}>
                    <Ionicons
                      name="checkmark-circle"
                      size={typography.sizes.sm}
                      color={colors.onsenVisited}
                    />
                    <Text style={styles.visitedText} numberOfLines={1}>
                      {t('onsenPreview.visited')}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <Pressable
            style={styles.dismiss}
            onPress={onDismiss}
            hitSlop={spacing[2]}
            accessibilityRole="button"
            accessibilityLabel={t('onsenPreview.dismiss')}
          >
            <Ionicons name="close" size={DISMISS_ICON_SIZE} color={colors.textMuted} />
          </Pressable>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Bottom-pinned, box-none wrapper: the empty area to the sides passes touches
  // through to the map; only the card itself is interactive. Sits clear of the
  // recenter button (bottom-right) by leaving left padding and capping width via
  // the card's own alignment.
  wrapper: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    bottom: spacing[2],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    paddingRight: spacing[8],
    borderRadius: radii.lg,
    backgroundColor: colors.background,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radii.md,
    backgroundColor: colors.backgroundSecondary,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: spacing[1],
  },
  name: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  area: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  fee: {
    flexShrink: 1,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  visitedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  visitedText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.onsenVisited,
  },
  // Top-right close target, sitting in the card's reserved right padding.
  dismiss: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
  },
});
