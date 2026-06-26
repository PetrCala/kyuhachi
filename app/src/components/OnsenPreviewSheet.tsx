import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import type { OnsenDocument } from '@kyuhachi/shared';
import { OnsenInfoRow } from '@/components/OnsenInfoRow';
import { OnsenFee } from '@/components/OnsenFee';
import { OnsenHours } from '@/components/OnsenHours';
import { colors, radii, shadows, spacing, typography } from '@/theme';

type OnsenRow = OnsenDocument & { id: string };

// The sheet rests at a single fixed height — image-forward, with room for a few
// info rows and the CTA without resizing to content.
const SNAP_POINTS = [450]; // DEBUG: fixed px (rules out 78%-of-a-0-height-container)
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
 * large hero image (or a themed placeholder when the onsen has no photo) anchors
 * the top with the name overlaid on a scrim and a close affordance; below it a
 * scrollable info area mirrors the detail screen's rows, and a pinned primary CTA
 * opens the full detail screen.
 *
 * Built on `@gorhom/bottom-sheet` (`BottomSheetModal`) for a fixed-height sheet
 * with smooth, native-quality swipe-to-dismiss and scroll/drag coordination — the
 * grabber, the backdrop, the hero close button, and a downward swipe all dismiss
 * it. The modal is driven by the `onsen` prop (non-null = presented), keeping the
 * map the single source of truth; the last onsen is retained while it animates out
 * so the content doesn't blank mid-exit.
 */
export default function OnsenPreviewSheet({
  onsen,
  visited,
  onClose,
  onViewDetails,
}: OnsenPreviewSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => SNAP_POINTS, []);

  // Keep showing the last onsen while the sheet animates out, so content doesn't
  // blank before the slide-down finishes.
  const [shown, setShown] = useState<OnsenRow | null>(onsen);

  // DEBUG: is Reanimated alive at all? Animate a shared value 0->100 and poll it
  // from JS. If it climbs over ~600ms, Reanimated drives animations (so the gorhom
  // no-op is layout/portal). If it stays 0 (or jumps instantly), Reanimated's
  // worklets aren't running — which is why gorhom never animates.
  const probe = useSharedValue(0);
  useEffect(() => {
    console.log('[preview] OnsenPreviewSheet mounted (provider context present)');
    console.log('[reanimated-test] starting withTiming on shared value');
    probe.value = withTiming(100, { duration: 600 });
    let n = 0;
    const id = setInterval(() => {
      console.log('[reanimated-test] probe.value =', probe.value);
      if (++n >= 6) clearInterval(id);
    }, 150);
    return () => clearInterval(id);
  }, [probe]);

  // Present when an onsen is selected, dismiss when cleared.
  useEffect(() => {
    console.log('[preview] onsen prop:', onsen?.id ?? null, '| sheetRef set?', !!sheetRef.current);
    if (onsen) {
      setShown(onsen);
      console.log('[preview] calling present()');
      try {
        sheetRef.current?.present();
        console.log('[preview] present() returned (no throw)');
      } catch (e) {
        console.log('[preview] present() THREW:', String(e));
      }
    } else {
      sheetRef.current?.dismiss();
    }
  }, [onsen]);

  // Latest onClose, read from the (stable) dismiss handler without rebuilding it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Any dismissal — swipe, backdrop, close button, or programmatic — clears the
  // map's selection so its state matches the closed sheet.
  const handleDismiss = useCallback(() => {
    console.log('[preview] onDismiss fired');
    onCloseRef.current();
  }, []);

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

  const directionsAction = shown
    ? {
        icon: 'navigate' as const,
        onPress: () => Linking.openURL(`https://maps.apple.com/?daddr=${shown.lat},${shown.lng}`),
        accessibilityLabel: t('onsenDetail.getDirections'),
      }
    : undefined;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={handleDismiss}
      onChange={(index) => console.log('[preview] sheet onChange index:', index)}
      onAnimate={(from, to) => console.log('[preview] sheet onAnimate:', from, '->', to)}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView
        onLayout={(e) =>
          console.log(
            '[preview] BottomSheetView onLayout h=',
            e.nativeEvent.layout.height,
            'w=',
            e.nativeEvent.layout.width
          )
        }
        style={[styles.content, { paddingBottom: insets.bottom + spacing[4] }]}
      >
        {shown && directionsAction ? (
          <>
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
              onPress={() => sheetRef.current?.dismiss()}
              accessibilityRole="button"
              accessibilityLabel={t('onsenPreview.close')}
              hitSlop={spacing[2]}
            >
              <Ionicons name="close" size={typography.sizes.xl} color={colors.textPrimary} />
            </Pressable>
          </View>

          <BottomSheetScrollView
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
          </BottomSheetScrollView>

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
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
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
  content: {
    flex: 1,
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
  body: {
    flex: 1,
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
