import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVisit } from '@/hooks/useVisit';
import { colors, spacing, typography, radii } from '@/theme';

/**
 * A visit's photos at full size: the only place photos past the first are
 * actually readable. Opened by tapping the photo strip on a visit card, at
 * whichever photo was tapped.
 *
 * Reads the visit through `useVisit` rather than taking the URLs as route
 * params: Firebase download URLs are long enough that six of them make an
 * unwieldy param payload, and the subscription keeps the viewer honest if the
 * visit is edited or deleted on another device while it's open.
 */
export default function VisitPhotosScreen() {
  const { id, index } = useLocalSearchParams<{ id?: string; index?: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { visit, loading } = useVisit(id);

  const urls = visit?.photoUrls ?? [];
  // Clamped: `index` arrives as a route param, and the visit it points into may
  // have lost photos since the card that linked here was rendered.
  const initial = Math.min(Math.max(Number(index) || 0, 0), Math.max(urls.length - 1, 0));
  // Null until the first swipe, so the counter reads the page the pager was
  // opened at. The pager mounts only once the photos have arrived, which can be
  // a render or two after this screen does, and seeding state at *this* render
  // would capture the `initial` of 0 computed while `urls` was still empty.
  const [page, setPage] = useState<number | null>(null);
  const current = page ?? initial;

  // Nothing left to show: the visit was deleted, or its last photo removed,
  // while this was open. Same "leave rather than sit on an empty screen" rule
  // the edit-visit modal follows.
  useEffect(() => {
    if (loading || urls.length > 0) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [loading, urls.length, router]);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const scrolledTo = Math.round(event.nativeEvent.contentOffset.x / width);
    setPage((p) => (p === scrolledTo ? p : scrolledTo));
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {urls.length > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Lands on the tapped photo without an animated scroll from the first
          // one. Safe as a mount-time-only value: the pager renders only once
          // `urls` is non-empty, and page tracking takes over from there.
          contentOffset={{ x: initial * width, y: 0 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {urls.map((url) => (
            <ExpoImage
              key={url}
              source={url}
              style={{ width, height }}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={150}
            />
          ))}
        </ScrollView>
      )}

      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('visits.closePhotos')}
          onPress={() => router.back()}
          hitSlop={spacing[2]}
          style={styles.closeButton}
        >
          <Ionicons name="close" size={typography.sizes.xl} color={colors.textInverted} />
        </Pressable>
        {urls.length > 1 && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {t('visits.photoOfCount', { index: current + 1, count: urls.length })}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.photoViewer,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
  closeButton: {
    width: spacing[8],
    height: spacing[8],
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    // A photo can be light where the controls sit, so both carry their own
    // scrim rather than relying on the ground behind them.
    backgroundColor: colors.overlay,
  },
  counter: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radii.full,
    backgroundColor: colors.overlay,
  },
  counterText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textInverted,
  },
});
