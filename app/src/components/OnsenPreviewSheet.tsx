import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { OnsenDocument } from '@kyuhachi/shared';
import { colors, radii, shadows, spacing, typography } from '@/theme';

type OnsenRow = OnsenDocument & { id: string };

// The sheet starts a full screen height below its resting place so it is always
// off-screen at rest regardless of its measured height; the ease-out curve lets
// the visible final stretch decelerate into place, like a native sheet.
const SCREEN_HEIGHT = Dimensions.get('window').height;
const ENTER_DURATION = 260;
const EXIT_DURATION = 200;
// A downward drag on the handle/hero region past this distance (px) or faster
// than this velocity flings the sheet away; anything less springs it back.
const DISMISS_DRAG_PX = 80;
const DISMISS_VELOCITY = 0.6;
// Hero image height — the image-forward focal point of the sheet.
const HERO_HEIGHT = 200;
// Glyph size for the placeholder mark when an onsen has no photo; a layout
// dimension, not part of the type scale.
const PLACEHOLDER_GLYPH = 56;

interface OnsenPreviewSheetProps {
  /** The selected onsen, or null when the sheet is dismissed. */
  onsen: OnsenRow | null;
  /** Whether the selected onsen is visited in the active challenge. */
  visited: boolean;
  /** Dismiss the sheet (backdrop tap, close affordance, hardware back). */
  onClose: () => void;
  /** Open the full onsen detail screen for the given id (the "enlarge" action). */
  onViewDetails: (id: string) => void;
}

/** A labelled value row mirroring the onsen detail screen's InfoRow layout. The
 *  optional inline action renders a tappable icon after the value (e.g. directions). */
function InfoRow({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: {
    icon: ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
    accessibilityLabel: string;
  };
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel} selectable>
        {label}
      </Text>
      <Text style={styles.infoValue} selectable>
        {value}
        {action && (
          <Text
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            suppressHighlighting
          >
            {'  '}
            <Ionicons name={action.icon} size={typography.sizes.md} color={colors.actionPrimary} />
          </Text>
        )}
      </Text>
    </View>
  );
}

/**
 * An image-forward half-sheet preview shown when a map marker is tapped. A large
 * hero image (or a themed placeholder when the onsen has no photo) anchors the
 * top, with the onsen name overlaid on a scrim; below it a scrollable info area
 * mirrors the detail screen's rows, and a pinned primary CTA opens the full
 * detail screen.
 *
 * Built on React Native's native Modal with an independently-animated backdrop
 * and an upward-sliding sheet (the RowActionsButton / TierClaimModal pattern) so
 * it feels like the native iOS sheet without pulling in a bottom-sheet library.
 *
 * The Modal stays mounted across dismiss so the exit animation can play; it is
 * driven by `onsen` (non-null = presented). The last non-null onsen is retained
 * while the sheet animates out so its content doesn't blank mid-exit.
 */
export default function OnsenPreviewSheet({
  onsen,
  visited,
  onClose,
  onViewDetails,
}: OnsenPreviewSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const visible = onsen != null;
  // The sheet's vertical offset in pixels: 0 = resting (presented), SCREEN_HEIGHT
  // = fully off-screen below. Driving the position directly (rather than a 0→1
  // progress) lets the drag-to-dismiss gesture track the finger 1:1.
  const sheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  // Backdrop dims in step with the sheet's travel, so a drag-down fades it too.
  const backdropOpacity = sheetY.interpolate({
    inputRange: [0, SCREEN_HEIGHT],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  // Keep showing the last onsen while the sheet animates out, so content doesn't
  // blank before the slide-down finishes.
  const [shown, setShown] = useState<OnsenRow | null>(onsen);

  // Latest onClose, read from inside the (stable) PanResponder without rebuilding it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!onsen) return;
    setShown(onsen);
    sheetY.setValue(SCREEN_HEIGHT);
    Animated.timing(sheetY, {
      toValue: 0,
      duration: ENTER_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [onsen, sheetY]);

  // Run the slide-down, then clear the retained onsen so the Modal can unmount its
  // content. Picks up from wherever the sheet currently sits — including a partial
  // drag — so a fling continues smoothly into the dismissal.
  useEffect(() => {
    if (onsen || !shown) return;
    Animated.timing(sheetY, {
      toValue: SCREEN_HEIGHT,
      duration: EXIT_DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setShown(null);
    });
  }, [onsen, shown, sheetY]);

  // Drag-to-dismiss, attached to the handle + hero region only. The scrollable
  // info area below is a sibling and keeps its own gestures, so swiping the text
  // scrolls it while a downward drag on the image (or handle) flings the whole
  // sheet away. The responder claims only a clear downward drag, so taps fall
  // through and the close button still works; releasing short of the threshold
  // springs the sheet back to rest.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && g.dy > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          if (g.dy > 0) sheetY.setValue(g.dy);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy > DISMISS_DRAG_PX || g.vy > DISMISS_VELOCITY) {
            onCloseRef.current();
          } else {
            Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        },
      }),
    [sheetY]
  );

  if (!shown) {
    return <Modal visible={false} transparent />;
  }

  const schedule = shown.businessHours;
  const directionsAction = {
    icon: 'navigate' as const,
    onPress: () => Linking.openURL(`https://maps.apple.com/?daddr=${shown.lat},${shown.lng}`),
    accessibilityLabel: t('onsenDetail.getDirections'),
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={t('onsenPreview.close')}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            shadows.lg,
            { paddingBottom: insets.bottom + spacing[4], transform: [{ translateY: sheetY }] },
          ]}
        >
          <View {...panResponder.panHandlers}>
            <View style={styles.handle} />

            <View style={styles.hero}>
              {shown.imageUrl ? (
                <Image source={{ uri: shown.imageUrl }} style={styles.heroImage} resizeMode="cover" />
              ) : (
                <View style={styles.heroPlaceholder}>
                  <Ionicons
                    name="image-outline"
                    size={PLACEHOLDER_GLYPH}
                    color={colors.textMuted}
                    accessibilityLabel={t('onsenPreview.imagePlaceholder')}
                  />
                </View>
              )}
              <View style={styles.heroScrim} pointerEvents="none" />
              <Text style={styles.heroName} numberOfLines={2}>
                {shown.name}
              </Text>
              <Pressable
                style={[styles.closeButton, shadows.sm]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('onsenPreview.close')}
                hitSlop={spacing[2]}
              >
                <Ionicons name="close" size={typography.sizes.xl} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.subheader}>
              <Text style={styles.area} selectable>
                {t('onsenPreview.areaPrefecture', {
                  area: shown.areaName,
                  prefecture: shown.prefecture,
                })}
              </Text>
              {visited && (
                <View style={styles.visitedBadge}>
                  <Text style={styles.visitedText}>{t('onsenPreview.visited')}</Text>
                  <Ionicons
                    name="checkmark-circle"
                    size={typography.sizes.md}
                    color={colors.stampInk}
                  />
                </View>
              )}
            </View>

            <View style={styles.section}>
              <InfoRow
                label={t('onsenDetail.labelAddress')}
                value={shown.address}
                action={directionsAction}
              />
              {shown.admissionFee && (
                <InfoRow label={t('onsenDetail.labelFee')} value={shown.admissionFee} />
              )}
              {shown.springQuality && (
                <InfoRow
                  label={t('onsenDetail.labelSpringQuality')}
                  value={shown.springQuality}
                />
              )}
              {schedule && (
                <InfoRow label={t('onsenDetail.labelHours')} value={schedule.raw} />
              )}
            </View>
          </ScrollView>

          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={() => onViewDetails(shown.id)}
            accessibilityRole="button"
            accessibilityLabel={t('onsenPreview.viewFullDetails')}
          >
            <Text style={styles.ctaText}>{t('onsenPreview.viewFullDetails')}</Text>
            <Ionicons
              name="chevron-forward"
              size={typography.sizes.md}
              color={colors.actionPrimaryText}
            />
          </Pressable>
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
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  // Grab affordance centered above the hero image.
  handle: {
    alignSelf: 'center',
    width: spacing[10],
    height: spacing[1],
    borderRadius: radii.full,
    backgroundColor: colors.separator,
    marginTop: spacing[2],
    marginBottom: spacing[2],
    zIndex: 1,
  },
  hero: {
    height: HERO_HEIGHT,
    justifyContent: 'flex-end',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    backgroundColor: colors.backgroundSecondary,
  },
  // Themed block standing in for a missing photo so the layout still reads as
  // image-forward.
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bottom-up dark gradient stand-in so the overlaid name stays legible over any
  // image. A solid translucent band rather than a true gradient (no gradient lib).
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HERO_HEIGHT / 2,
    backgroundColor: colors.overlay,
  },
  heroName: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textInverted,
  },
  closeButton: {
    position: 'absolute',
    top: spacing[3],
    right: spacing[3],
    width: spacing[8],
    height: spacing[8],
    borderRadius: radii.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  subheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  area: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  visitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginLeft: spacing[2],
  },
  visitedText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    // Dark seal ink — matches the "visited" stamp on the onsen detail screen.
    color: colors.stampInk,
  },
  section: {
    paddingTop: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: spacing[2],
  },
  infoLabel: {
    width: spacing[12] + spacing[8],
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: typography.sizes.xl,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    paddingVertical: spacing[4],
    borderRadius: radii.md,
    backgroundColor: colors.actionPrimary,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
  },
});
