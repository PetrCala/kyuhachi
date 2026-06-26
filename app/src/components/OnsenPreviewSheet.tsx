import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { OnsenDocument } from '@kyuhachi/shared';
import { OnsenInfoRow } from '@/components/OnsenInfoRow';
import { OnsenFee } from '@/components/OnsenFee';
import { OnsenHours } from '@/components/OnsenHours';
import { colors, radii, shadows, spacing, typography } from '@/theme';

type OnsenRow = OnsenDocument & { id: string };

// The sheet rests at a single fixed height — image-forward, with room for a few
// info rows and the CTA without resizing to content.
const SNAP_POINTS = ['78%'];
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
  /** Dismiss the sheet (backdrop tap, close affordance, swipe-down). */
  onClose: () => void;
  /** Open the full onsen detail screen for the given id (the "enlarge" action). */
  onViewDetails: (id: string) => void;
}

/**
 * An image-forward bottom-sheet preview shown when a map marker is tapped. A
 * large hero image (or a themed placeholder when the onsen has no photo) is
 * pinned at the top with the name overlaid on a scrim and a close affordance;
 * below it a scrollable info area mirrors the detail screen's rows, and a pinned
 * primary CTA opens the full detail screen.
 *
 * Built on `@gorhom/bottom-sheet`'s inline `BottomSheet` (rendered in place as a
 * sibling of the map). We deliberately do NOT use the portal-based
 * `BottomSheetModal` here: its `@gorhom/portal` host does not render on React
 * Native's New Architecture (`present()` runs but nothing ever mounts), whereas
 * the inline sheet renders fine.
 *
 * The sheet is a fixed height, so content is laid out the way gorhom expects for a
 * fixed frame: a `BottomSheetScrollView` is the scrollable body (the hero is its
 * sticky first row, so it stays pinned while the info scrolls under it), and the
 * CTA lives in a pinned `footerComponent` — long onsen text scrolls instead of
 * pushing the CTA off-screen. Driven by the `onsen` prop: snapped open via the ref
 * when an onsen is selected, closed when cleared; the last onsen is retained while
 * it animates out so the content doesn't blank mid-exit.
 */
export default function OnsenPreviewSheet({
  onsen,
  visited,
  onClose,
  onViewDetails,
}: OnsenPreviewSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => SNAP_POINTS, []);
  // Measured height of the pinned footer, so the scroll body can clear it (the
  // footer overlays the content rather than reserving space).
  const [footerHeight, setFooterHeight] = useState(0);

  // Keep showing the last onsen while the sheet animates out, so content doesn't
  // blank before the slide-down finishes.
  const [shown, setShown] = useState<OnsenRow | null>(onsen);

  // Open when an onsen is selected, close when cleared. The sheet stays mounted
  // (closed at index -1) so it can animate; we drive it imperatively via the ref.
  useEffect(() => {
    if (onsen) {
      setShown(onsen);
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [onsen]);

  // Latest onClose, read from the (stable) close handler without rebuilding it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Any close — swipe, backdrop, close button, or programmatic — clears the map's
  // selection so its state matches the closed sheet.
  const handleClose = useCallback(() => onCloseRef.current(), []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  // Pinned CTA. Lives in the footer so it stays visible no matter how long the
  // onsen's info is; its measured height feeds the scroll body's bottom padding.
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) =>
      shown ? (
        <BottomSheetFooter {...props} bottomInset={insets.bottom}>
          <View
            style={styles.footer}
            onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          >
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
          </View>
        </BottomSheetFooter>
      ) : null,
    [shown, onViewDetails, insets.bottom, t]
  );

  const directionsAction = shown
    ? {
        icon: 'navigate' as const,
        onPress: () => Linking.openURL(`https://maps.apple.com/?daddr=${shown.lat},${shown.lng}`),
        accessibilityLabel: t('onsenDetail.getDirections'),
      }
    : undefined;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={handleClose}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      {shown && directionsAction ? (
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: footerHeight + insets.bottom }}
          stickyHeaderIndices={[0]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            {shown.imageUrl ? (
              <Image
                source={shown.imageUrl}
                style={styles.heroImage}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
                placeholder={shown.blurhash ? { blurhash: shown.blurhash } : undefined}
                placeholderContentFit="cover"
              />
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
              onPress={() => sheetRef.current?.close()}
              accessibilityRole="button"
              accessibilityLabel={t('onsenPreview.close')}
              hitSlop={spacing[2]}
            >
              <Ionicons name="close" size={typography.sizes.xl} color={colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.info}>
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
              <OnsenInfoRow
                label={t('onsenDetail.labelAddress')}
                value={shown.address}
                action={directionsAction}
              />
              <OnsenFee admissionFee={shown.admissionFee} adultFee={shown.adultFee} />
              {shown.springQuality && (
                <OnsenInfoRow
                  label={t('onsenDetail.labelSpringQuality')}
                  value={shown.springQuality}
                />
              )}
              {shown.businessHours && <OnsenHours hours={shown.businessHours} />}
            </View>
          </View>
        </BottomSheetScrollView>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // The sheet surface: app background with rounded top corners. The grabber sits
  // above the content on this surface, so the hero never meets the rounded edge.
  sheetBackground: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  handleIndicator: {
    backgroundColor: colors.separator,
  },
  // Pinned hero (sticky first row of the scroll body); full-bleed, so no padding.
  hero: {
    height: HERO_HEIGHT,
    justifyContent: 'flex-end',
    backgroundColor: colors.background,
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
  // Bottom-up dark band stand-in so the overlaid name stays legible over any
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
  // Scrollable info area below the pinned hero.
  info: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
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
  // Pinned footer surface around the CTA: app background so scrolled content
  // doesn't show through behind the button.
  footer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    backgroundColor: colors.background,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
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
