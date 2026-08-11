import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image as ExpoImage, type ImageStyle } from 'expo-image';
import { useTranslation } from 'react-i18next';
import type { CachedOnsen } from '@kyuhachi/shared';
import OnsenHeroMark from '@/components/OnsenHeroMark';
import { SHOW_CATALOG_PHOTOS } from '@/lib/catalog-photos';

interface OnsenHeroImageProps {
  onsen: CachedOnsen;
  /** Sizing/position for the hero frame; each caller lays out its own. */
  style: StyleProp<ViewStyle>;
}

/**
 * An onsen's hero: its photograph, or the mark drawn in its place.
 *
 * Catalog photographs are gated off entirely by `SHOW_CATALOG_PHOTOS` (see that
 * constant for why), so today every onsen renders `OnsenHeroMark`: an emblem
 * generated from the onsen's prefecture, spring quality, and id. That carries
 * real information about the place and reads as a designed mark, so the slot
 * neither looks broken nor promises a photo it can't show. The mark is
 * deliberately independent of `blurhash`, which only ever described the scraped
 * photo set — nothing on this path reads it.
 *
 * Both fields stay on the document and the photo branch below stays intact, so
 * re-enabling photography is still the one-constant flip it was. Shared user
 * visit photos are the eventual answer here, and will slot into the same
 * branch.
 *
 * Shared by the map preview sheet and the onsen detail screen so the gate and
 * the stand-in live in exactly one place.
 */
export default function OnsenHeroImage({ onsen, style }: OnsenHeroImageProps) {
  const { t } = useTranslation();

  if (SHOW_CATALOG_PHOTOS && onsen.imageUrl) {
    return (
      <ExpoImage
        source={onsen.imageUrl}
        // expo-image's ImageStyle narrows a couple of RN's ViewStyle unions
        // (e.g. `overflow`); the frame styles callers actually pass (size,
        // position, background) sit in the overlap, so this cast is safe.
        style={style as StyleProp<ImageStyle>}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
        placeholder={onsen.blurhash ? { blurhash: onsen.blurhash } : undefined}
        placeholderContentFit="cover"
      />
    );
  }

  return (
    // One accessibility element: the mark is decorative, and what it encodes
    // (prefecture, spring quality) is already on the screen as text.
    <View style={[style, styles.mark]} accessible accessibilityLabel={t('onsenPreview.onsenMark')}>
      <OnsenHeroMark onsen={onsen} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    overflow: 'hidden',
  },
});
