import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { CachedOnsen } from '@kyuhachi/shared';
import OnsenHeroImage from '@/components/OnsenHeroImage';
import { OnsenInfoRow } from '@/components/OnsenInfoRow';
import { OnsenFee } from '@/components/OnsenFee';
import { OnsenHours } from '@/components/OnsenHours';
import { usePreferences } from '@/context/PreferencesContext';
import { onsenReading } from '@/lib/onsen-name';
import { colors, radii, shadows, spacing, typography } from '@/theme';

type OnsenRow = CachedOnsen;

// The sheet rests at a single fixed height, image-forward, with room for a few
// info rows and the CTA without resizing to content.
const SNAP_POINTS = ['78%'];
// Hero image height: the image-forward focal point of the sheet.
const HERO_HEIGHT = 200;

interface OnsenPreviewSheetProps {
  /** The onsen to preview. Always set: the parent mounts this component only
   *  while there is something to show (see the note on the component). */
  onsen: OnsenRow;
  /** Whether the sheet should be open. Flipping this to false plays the
   *  slide-out; `onClosed` reports when that has finished. */
  open: boolean;
  /** Whether the previewed onsen is visited in the active challenge. */
  visited: boolean;
  /** The sheet has finished animating closed (by swipe, backdrop tap, the close
   *  affordance, or `open` going false) and can now be unmounted. */
  onClosed: () => void;
  /** Open the full onsen detail screen for the given id (the "enlarge" action). */
  onViewDetails: (id: string) => void;
}

/**
 * An image-forward bottom-sheet preview shown when a map marker is tapped. A
 * large hero (a photo, or the generated `OnsenHeroImage` mark while
 * `SHOW_CATALOG_PHOTOS` is off) is pinned at the top with the name overlaid on
 * a scrim and a close affordance; below it a scrollable info area mirrors the
 * detail screen's rows, and a pinned primary CTA opens the full detail screen.
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
 * CTA lives in a pinned `footerComponent`: long onsen text scrolls instead of
 * pushing the CTA off-screen.
 *
 * IMPORTANT: this component must be mounted only while it has an onsen to show,
 * and it never renders a closed, idle sheet. Even closed, gorhom always mounts a
 * full-screen `pointerEvents="box-none"` container (`BottomSheetHostingContainer`),
 * and such a sibling over the native map can swallow the map's pan gesture on iOS
 * (worse on the New Architecture), freezing the map while overlay buttons still
 * tap: exactly the regression fixed in #109. So the parent owns the mount, this
 * component animates itself in on mount (`index={0}` plus gorhom's default
 * `animateOnMount`, the only reliable way in: `snapToIndex` from a mount effect is
 * a no-op because the sheet's layout has not been measured yet), and it reports
 * `onClosed` once the slide-out has finished so the parent can unmount it. Between
 * those two points the sheet owns the screen, backdrop included, exactly as before.
 */
export default function OnsenPreviewSheet({
  onsen,
  open,
  visited,
  onClosed,
  onViewDetails,
}: OnsenPreviewSheetProps) {
  const { t, i18n } = useTranslation();
  const { showReadings } = usePreferences();
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => SNAP_POINTS, []);
  // Measured height of the pinned footer, so the scroll body can clear it (the
  // footer overlays the content rather than reserving space).
  const [footerHeight, setFooterHeight] = useState(0);

  // Play the slide-out when the parent lowers `open` (its "View full details" CTA
  // dismisses the sheet as it pushes the detail screen). Driven through the ref
  // rather than by handing gorhom a new `index`: the index prop is ignored while
  // the entrance animation is still in flight, so a quick dismissal would be
  // dropped and leave the sheet sitting open over the map, whereas the imperative
  // close animates from wherever the sheet has got to.
  useEffect(() => {
    if (!open) sheetRef.current?.close();
  }, [open]);

  // Latest onClosed, read from the (stable) handler without rebuilding it.
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  // gorhom fires `onClose` from its animation-completed worklet, i.e. once the
  // slide-out has actually finished, which is precisely when the parent may drop
  // the mount. Any close routes through here: swipe-down, backdrop tap, the close
  // affordance, or `open` going false.
  const handleClosed = useCallback(() => onClosedRef.current(), []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        // Belt and braces against the same "invisible sheet over the map" trap:
        // the backdrop starts with pointerEvents 'auto' unless this is set, and
        // only drops to 'none' through a runOnJS hop that its own isMounted guard
        // can swallow. With touch-through it starts at 'none' instead and the same
        // reaction raises it to 'auto' as the sheet opens, so the backdrop is
        // tappable exactly while it is visible and never a moment before.
        enableTouchThrough
      />
    ),
    []
  );

  // Pinned CTA. Lives in the footer so it stays visible no matter how long the
  // onsen's info is; its measured height feeds the scroll body's bottom padding.
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      // No bottomInset: the sheet sits inside the map tab, above the tab bar,
      // which already owns the home-indicator safe area, so the CTA hugs the
      // tab bar instead of floating a safe-area gap above it.
      <BottomSheetFooter {...props}>
        <View
          style={styles.footer}
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
        >
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={() => onViewDetails(onsen.id)}
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
    ),
    [onsen.id, onViewDetails, t]
  );

  const directionsAction = {
    icon: 'navigate' as const,
    onPress: () => Linking.openURL(`https://maps.apple.com/?daddr=${onsen.lat},${onsen.lng}`),
    accessibilityLabel: t('onsenDetail.getDirections'),
  };

  // Reading shown under the hero name: romaji in a non-JP UI, kana in Japanese.
  const reading = onsenReading({
    nameRomaji: onsen.nameRomaji,
    nameKana: onsen.nameKana,
    language: i18n.language,
    showReadings,
  });

  return (
    <BottomSheet
      ref={sheetRef}
      // The mount position: the sheet opens itself as it appears, animating in
      // because gorhom's `animateOnMount` defaults to true. Closing goes through
      // the ref (see the effect above), not through this prop.
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={handleClosed}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ paddingBottom: footerHeight + spacing[2] }}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        // No rubber-band overscroll at the top: when the body reaches its top
        // the sticky hero (and the sheet itself) stay put instead of bouncing.
        // Swipe-down-to-close still fires from the handle/backdrop.
        bounces={false}
      >
        <View style={styles.hero}>
          <OnsenHeroImage onsen={onsen} style={styles.heroImage} />
          <View style={styles.heroScrim} pointerEvents="none" />
          <View style={styles.heroText} pointerEvents="none">
            <Text style={styles.heroName} numberOfLines={2}>
              {onsen.name}
            </Text>
            {reading && (
              <Text style={styles.heroReading} numberOfLines={1}>
                {reading}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.info}>
          <View style={styles.subheader}>
            <Text style={styles.area} selectable>
              {t('onsenPreview.areaPrefecture', {
                area: onsen.areaName,
                prefecture: onsen.prefecture,
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
              value={onsen.address}
              action={directionsAction}
            />
            <OnsenFee admissionFee={onsen.admissionFee} adultFee={onsen.adultFee} />
            {onsen.springQuality && (
              <OnsenInfoRow
                label={t('onsenDetail.labelSpringQuality')}
                value={onsen.springQuality}
              />
            )}
            {onsen.businessHours && <OnsenHours hours={onsen.businessHours} />}
          </View>
        </View>
      </BottomSheetScrollView>

      {/*
       * Close affordance, rendered as a sibling overlay of the scroll body
       * rather than inside the (sticky) hero. Inside the scroll view a tap
       * during deceleration is swallowed to stop the scroll instead of firing
       * the press; lifted out, it always takes priority so dismissal never
       * misses. It still sits over the hero's top-right because the hero rests
       * at scroll offset 0.
       */}
      <Pressable
        style={[styles.closeButton, shadows.sm]}
        onPress={() => sheetRef.current?.close()}
        accessibilityRole="button"
        accessibilityLabel={t('onsenPreview.close')}
        hitSlop={spacing[2]}
      >
        <Ionicons name="close" size={typography.sizes.xl} color={colors.textPrimary} />
      </Pressable>
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
    backgroundColor: colors.background,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    backgroundColor: colors.backgroundSecondary,
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
  // Name + reading block, pinned to the bottom of the hero so it sits over the
  // dark scrim, regardless of the sheet's sticky-header layout.
  heroText: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  heroName: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textInverted,
  },
  // Romaji reading under the name; same inverted ink, lighter and smaller so the
  // kanji name stays the focal point.
  heroReading: {
    marginTop: spacing[1],
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textInverted,
    opacity: 0.9,
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
    // Dark seal ink: matches the "visited" stamp on the onsen detail screen.
    color: colors.stampInk,
  },
  section: {
    paddingTop: spacing[2],
  },
  // Pinned footer surface around the CTA: app background so scrolled content
  // doesn't show through behind the button.
  footer: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
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
