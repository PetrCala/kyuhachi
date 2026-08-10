import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image as ExpoImage, type ImageStyle } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { averageRgbFromBlurhash, contrastingTint, rgbToCss } from '@/lib/blurhash-color';
import { SHOW_CATALOG_PHOTOS } from '@/lib/catalog-photos';

const GLYPH = require('../../assets/onsen-symbol.png');

// Glyph size for the placeholder mark; callers whose hero is a different
// scale (the map preview sheet vs. the detail screen) may override it.
const DEFAULT_GLYPH_SIZE = 56;

interface OnsenHeroImageProps {
  imageUrl: string | null;
  blurhash: string | null;
  /** Sizing/position for the hero frame; each caller lays out its own. */
  style: StyleProp<ViewStyle>;
  /** Size of the onsen-symbol glyph shown over the tint when there's no photo. */
  glyphSize?: number;
}

/**
 * An onsen's hero image, or its stand-in when there's no photo to show.
 *
 * Catalog photographs are currently gated off entirely by
 * `SHOW_CATALOG_PHOTOS` (see that constant for why), so today every onsen
 * renders the stand-in: the source photo's BlurHash decoded down to just its
 * average colour, tinting a plate behind the app's onsen-symbol mark. Each
 * onsen keeps a distinct, place-derived colour instead of one flat empty
 * block, and the glyph's own tint flips between ink and inverted so it stays
 * readable against arbitrarily light or dark derived colours.
 *
 * Shared by the map preview sheet and the onsen detail screen so the gate and
 * the placeholder logic live in exactly one place.
 */
export default function OnsenHeroImage({
  imageUrl,
  blurhash,
  style,
  glyphSize = DEFAULT_GLYPH_SIZE,
}: OnsenHeroImageProps) {
  const { t } = useTranslation();

  if (SHOW_CATALOG_PHOTOS && imageUrl) {
    return (
      <ExpoImage
        source={imageUrl}
        // expo-image's ImageStyle narrows a couple of RN's ViewStyle unions
        // (e.g. `overflow`); the frame styles callers actually pass (size,
        // position, background) sit in the overlap, so this cast is safe.
        style={style as StyleProp<ImageStyle>}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
        placeholder={blurhash ? { blurhash } : undefined}
        placeholderContentFit="cover"
      />
    );
  }

  const rgb = averageRgbFromBlurhash(blurhash);
  return (
    <View
      style={[style, styles.placeholder, { backgroundColor: rgbToCss(rgb) }]}
      accessibilityLabel={t('onsenPreview.imagePlaceholder')}
    >
      <Image
        source={GLYPH}
        // width/height/tintColor are runtime values derived from the onsen's
        // own BlurHash: the allowed exception to the no-inline-literal rule.
        style={{ width: glyphSize, height: glyphSize, tintColor: contrastingTint(rgb) }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
