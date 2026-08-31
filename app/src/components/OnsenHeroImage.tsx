import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useTranslation } from 'react-i18next';
import type { CachedOnsen } from '@kyuhachi/shared';
import OnsenHeroMark from '@/components/OnsenHeroMark';
import { SHOW_CATALOG_PHOTOS } from '@/lib/catalog-photos';
import { colors, radii, spacing, typography } from '@/theme';

interface OnsenHeroImageProps {
  onsen: CachedOnsen;
  /** Sizing/position for the hero frame; each caller lays out its own. */
  style: StyleProp<ViewStyle>;
}

/**
 * An onsen's hero: its photograph, or the mark drawn in its place.
 *
 * Catalog photographs are gated by `SHOW_CATALOG_PHOTOS` (see that constant for
 * the licence history). With the flag on, an onsen that has an `imageUrl` shows
 * the photo; the rest fall back to `OnsenHeroMark`, an emblem generated from the
 * onsen's prefecture, spring quality, and id. The mark is deliberately
 * independent of `blurhash`, which only ever described the photo set, so an
 * onsen with no photo never renders an empty plate.
 *
 * Photos carry a credit, which is why they live behind this one component
 * rather than being rendered at each call site: 九州観光機構 granted the licence
 * on a request that offered per-photo credit plus a link back, and a credit that
 * each screen has to remember to add is one a new screen will forget. Anything
 * showing a catalog photo goes through here.
 *
 * Shared by the map preview sheet and the onsen detail screen so the gate, the
 * credit, and the stand-in all live in exactly one place.
 */
export default function OnsenHeroImage({ onsen, style }: OnsenHeroImageProps) {
  const { t } = useTranslation();

  if (SHOW_CATALOG_PHOTOS && onsen.imageUrl) {
    return (
      // The frame is the caller's; the photo fills it absolutely so the credit
      // can sit over it. Callers pass either a flow box (the detail screen's
      // 140pt band) or an absolute fill (the preview sheet's sticky hero), and
      // both work as the positioning parent.
      <View style={[style, styles.frame]}>
        <ExpoImage
          source={onsen.imageUrl}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          placeholder={onsen.blurhash ? { blurhash: onsen.blurhash } : undefined}
          placeholderContentFit="cover"
        />
        <PhotoCredit sourceUrl={onsen.detailPageUrl} label={t('onsenPhoto.credit')} />
      </View>
    );
  }

  return (
    // One accessibility element: the mark is decorative, and what it encodes
    // (prefecture, spring quality) is already on the screen as text.
    <View style={[style, styles.frame]} accessible accessibilityLabel={t('onsenPreview.onsenMark')}>
      <OnsenHeroMark onsen={onsen} />
    </View>
  );
}

/**
 * The credit over a catalog photo, linking back to the onsen's page on the
 * source site.
 *
 * Top-left rather than the conventional bottom corner: the preview sheet's hero
 * already spends its top-right on the close button and its whole bottom on the
 * name scrim, and a credit that a long two-line name can overlap is not a credit
 * we've actually given.
 *
 * `sourceUrl` is null on any onsen published before the data repo backfilled
 * `detailPageUrl`, so the credit degrades to plain text rather than a dead tap
 * target. The attribution itself is never conditional; only the link is.
 */
function PhotoCredit({ sourceUrl, label }: { sourceUrl: string | null; label: string }) {
  if (!sourceUrl) {
    return (
      <View style={styles.credit} pointerEvents="none">
        <Text style={styles.creditText}>{label}</Text>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.credit}
      // The pill is small by design, so the tap target is grown rather than the
      // pill: a photo credit should not compete with the photo.
      hitSlop={spacing[2]}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => {
        // Nothing to fall back to if the source site can't be opened, and a
        // failed credit tap shouldn't take the screen down with it.
        void Linking.openURL(sourceUrl).catch(() => {});
      }}
    >
      <Text style={styles.creditText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
  // Its own translucent ground: the preview sheet's scrim only covers the bottom
  // half of the hero, and the detail screen's band has no scrim at all, so the
  // credit cannot borrow legibility from either caller.
  credit: {
    position: 'absolute',
    top: spacing[2],
    left: spacing[2],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radii.full,
    backgroundColor: colors.overlay,
  },
  creditText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    color: colors.textInverted,
  },
});
