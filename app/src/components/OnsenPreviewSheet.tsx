import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { OnsenDocument } from '@kyuhachi/shared';
import { colors, spacing, typography, radii, shadows } from '@/theme';

type OnsenRow = OnsenDocument & { id: string };

// The sheet starts a full screen height below its resting place so it is always
// off-screen at rest regardless of its measured height; the ease-out curve makes
// the visible final stretch decelerate into place, like the native sheet.
const SCREEN_HEIGHT = Dimensions.get('window').height;
const ENTER_DURATION = 260;
const EXIT_DURATION = 200;

interface OnsenPreviewSheetProps {
  /** The tapped onsen to preview; null keeps the sheet dismissed. */
  onsen: OnsenRow | null;
  /** Whether this onsen is visited in the active challenge → shows the badge. */
  visited: boolean;
  /** Opens Apple Maps directions to the onsen. */
  onGetDirections: (onsen: OnsenRow) => void;
  /** Navigates to the full onsen detail screen. */
  onViewDetails: (onsen: OnsenRow) => void;
  /** Dismisses the sheet (backdrop tap, close button, or after an action). */
  onClose: () => void;
}

/**
 * A bottom-sheet preview of a tapped onsen pin. The backdrop fades in while the
 * sheet slides up from the bottom — the two are animated independently so it
 * feels like a native sheet rather than the whole surface sliding. Mirrors the
 * modal/animation pattern in RowActionsButton (no @gorhom/bottom-sheet).
 *
 * The sheet is kept mounted across a dismiss so the slide-down can play out; it
 * holds the last onsen until the exit animation finishes, then unmounts itself.
 */
export default function OnsenPreviewSheet({
  onsen,
  visited,
  onGetDirections,
  onViewDetails,
  onClose,
}: OnsenPreviewSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // 0 = dismissed (backdrop clear, sheet off-screen), 1 = presented.
  const anim = useRef(new Animated.Value(0)).current;
  // The onsen currently rendered. Lags `onsen` on close so the slide-down can
  // animate the last content out before the modal unmounts.
  const [shown, setShown] = useState<OnsenRow | null>(onsen);

  useEffect(() => {
    if (onsen) {
      setShown(onsen);
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: ENTER_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (shown) {
      Animated.timing(anim, {
        toValue: 0,
        duration: EXIT_DURATION,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShown(null);
      });
    }
  }, [onsen, anim, shown]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  });

  if (!shown) {
    return <Modal visible={false} transparent />;
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: anim }]}>
          <Pressable
            style={styles.backdropPress}
            accessibilityRole="button"
            accessibilityLabel={t('onsenPreview.close')}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            shadows.lg,
            { paddingBottom: insets.bottom + spacing[2], transform: [{ translateY }] },
          ]}
        >
          {shown.imageUrl ? (
            <Image source={{ uri: shown.imageUrl }} style={styles.hero} resizeMode="cover" />
          ) : null}

          <Pressable
            style={styles.closeButton}
            hitSlop={spacing[2]}
            accessibilityRole="button"
            accessibilityLabel={t('onsenPreview.close')}
            onPress={onClose}
          >
            <Ionicons name="close" size={typography.sizes.xl} color={colors.textInverted} />
          </Pressable>

          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={2}>
              {shown.name}
            </Text>
            <Text style={styles.area} numberOfLines={1}>
              {shown.areaName}　{shown.prefecture}
            </Text>

            {visited ? (
              <View style={styles.visitedBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={typography.sizes.md}
                  color={colors.onsenVisited}
                />
                <Text style={styles.visitedText}>{t('onsenDetail.visited')}</Text>
              </View>
            ) : null}

            {shown.admissionFee ? (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>{t('onsenDetail.labelFee')}</Text>
                <Text style={styles.factValue} numberOfLines={2}>
                  {shown.admissionFee}
                </Text>
              </View>
            ) : null}
            {shown.springQuality ? (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>{t('onsenDetail.labelSpringQuality')}</Text>
                <Text style={styles.factValue} numberOfLines={2}>
                  {shown.springQuality}
                </Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.buttonPressed,
                ]}
                accessibilityRole="button"
                onPress={() => onGetDirections(shown)}
              >
                <Ionicons
                  name="navigate"
                  size={typography.sizes.md}
                  color={colors.actionPrimary}
                />
                <Text style={styles.secondaryButtonText}>{t('onsenDetail.getDirections')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}
                accessibilityRole="button"
                onPress={() => onViewDetails(shown)}
              >
                <Text style={styles.primaryButtonText}>{t('onsenPreview.viewDetails')}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  backdropPress: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
  },
  hero: {
    width: '100%',
    height: 180,
    backgroundColor: colors.backgroundSecondary,
  },
  // Circular close affordance pinned top-right; reads on both the hero image and
  // a plain sheet via a translucent dark scrim behind the white glyph.
  closeButton: {
    position: 'absolute',
    top: spacing[3],
    right: spacing[3],
    width: spacing[8],
    height: spacing[8],
    borderRadius: radii.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    gap: spacing[2],
  },
  name: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  area: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  visitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  visitedText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.onsenVisited,
  },
  factRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  factLabel: {
    width: 80,
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  factValue: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[3],
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    paddingVertical: spacing[3],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  secondaryButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimary,
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    borderRadius: radii.md,
    backgroundColor: colors.actionPrimary,
  },
  primaryButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
