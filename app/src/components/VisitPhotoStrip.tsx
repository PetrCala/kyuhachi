import { useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { colors, spacing, radii } from '@/theme';

/** Photo frame shape. Matches the single-photo card this replaced. */
const ASPECT_RATIO = 3 / 2;

/** Diameter of a page dot, in points. */
const DOT_SIZE = 6;

/** Opacity of the dots for pages other than the current one. */
const DOT_INACTIVE_OPACITY = 0.45;

interface VisitPhotoStripProps {
  /** The visit's photos, in stored order. The first is the cover. */
  urls: string[];
  /** Opens the full-screen viewer at the tapped photo. */
  onPressPhoto?: (index: number) => void;
}

/**
 * A visit's photos as a paged horizontal strip: one photo per page, swiped
 * sideways, with a dot per page. Tapping opens the full-screen viewer.
 *
 * Photos load lazily rather than all at once. A feed screen can hold several of
 * these, and visit photos are camera-sized, so mounting all six of every card's
 * photos would pull tens of megabytes for images most readers never swipe to.
 * `loadedThrough` mounts the current page plus the next one and only ever grows,
 * so a photo the user has already swiped past stays mounted (and instant to
 * swipe back to) while ones they never reached are never fetched at all.
 */
export function VisitPhotoStrip({ urls, onPressPhoto }: VisitPhotoStripProps) {
  const { t } = useTranslation();
  // Page width, measured rather than assumed: the strip sits inside a card whose
  // own padding decides it. Zero until the first layout pass, which is why the
  // pager below waits for it (the frame's aspect ratio still reserves the space,
  // so nothing jumps when it arrives).
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [loadedThrough, setLoadedThrough] = useState(1);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width === 0) return;
    const position = event.nativeEvent.contentOffset.x / width;
    const current = Math.round(position);
    // Tracked during the drag, not on momentum end, so the next photo starts
    // loading as it's pulled into view rather than after the swipe lands.
    setPage((p) => (p === current ? p : current));
    setLoadedThrough((n) => Math.max(n, current + 1));
  }

  return (
    <View style={styles.frame} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {urls.map((url, index) => (
            <Pressable
              key={url}
              accessibilityRole="imagebutton"
              accessibilityLabel={
                urls.length > 1
                  ? t('visits.photoOfCount', { index: index + 1, count: urls.length })
                  : t('visits.photo')
              }
              onPress={() => onPressPhoto?.(index)}
              style={[styles.slide, { width }]}
            >
              {index <= loadedThrough && (
                <ExpoImage
                  source={url}
                  style={styles.photo}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                />
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}

      {urls.length > 1 && (
        <View style={styles.dotsRow} pointerEvents="none">
          <View style={styles.dots}>
            {urls.map((url, index) => (
              <View key={url} style={index === page ? styles.dot : styles.dotInactive} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    marginTop: spacing[3],
    aspectRatio: ASPECT_RATIO,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.backgroundSecondary,
  },
  slide: {
    height: '100%',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  dotsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing[2],
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radii.full,
    // A pill behind the dots: white dots alone vanish against a bright photo.
    backgroundColor: colors.overlay,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.textInverted,
  },
  dotInactive: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.textInverted,
    opacity: DOT_INACTIVE_OPACITY,
  },
});
