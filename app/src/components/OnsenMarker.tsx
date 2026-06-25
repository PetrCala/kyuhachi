import { memo, useCallback, useState, type ElementRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, spacing, radii, typography } from '@/theme';

interface OnsenMarkerProps {
  id: string;
  lat: number;
  lng: number;
  /** Onsen name — shown as the callout title (Firestore data, untranslated). */
  name: string;
  /** Area name — shown in the callout subtitle (Firestore data, untranslated). */
  areaName: string;
  /** Prefecture — shown after the area in the callout subtitle (Firestore data). */
  prefecture: string;
  /** Admission fee string e.g. "¥800" (Firestore data); omitted from the callout when null. */
  admissionFee: string | null;
  /** Hero thumbnail URL; omitted from the callout when null. */
  imageUrl: string | null;
  /** Visited in the active challenge → bath-water-blue pin + a visited badge in the callout. */
  visited: boolean;
  /** Registers this marker's imperative handle with the parent (keyed by id) so an
   *  arriving "Show on map" focus can pop the matching callout. Must be stable. */
  registerRef: (id: string, ref: ElementRef<typeof Marker> | null) => void;
  /** Opens the onsen detail screen when its callout is tapped. Must be stable. */
  onPress: (id: string) => void;
}

/**
 * A single onsen pin on the map with a rich custom callout balloon.
 *
 * Memoized so that the map screen's frequent re-renders — the zoom slider streams
 * the live camera altitude on every frame of a pinch or pan — do not re-render or
 * re-attach all ~155 markers each frame. Only the markers whose own props actually
 * change (e.g. `visited` flips after a check-in, or the pin is filtered out)
 * re-render. Props are kept primitive and the two callbacks stable so React.memo's
 * shallow comparison holds.
 *
 * `tracksViewChanges` is the one piece of per-marker local state. On Apple Maps an
 * <Image> inside a callout often paints blank because the marker's snapshot is
 * taken before the remote image finishes loading. We keep view-change tracking on
 * only until the thumbnail's `onLoadEnd` fires (or not at all when there is no
 * image), then switch it off so the marker stops redrawing every frame.
 */
function OnsenMarker({
  id,
  lat,
  lng,
  name,
  areaName,
  prefecture,
  admissionFee,
  imageUrl,
  visited,
  registerRef,
  onPress,
}: OnsenMarkerProps) {
  const { t } = useTranslation();

  // Track view changes until the thumbnail has loaded so the native callout
  // snapshot captures the image; pins without a thumbnail never need tracking.
  const [tracksViewChanges, setTracksViewChanges] = useState(imageUrl !== null);
  const stopTracking = useCallback(() => setTracksViewChanges(false), []);

  // Stable for this marker's lifetime (id never changes), so the underlying
  // Marker's ref isn't detached/re-attached on the rare re-render.
  const setRef = useCallback(
    (ref: ElementRef<typeof Marker> | null) => registerRef(id, ref),
    [id, registerRef]
  );
  const handleCalloutPress = useCallback(() => onPress(id), [id, onPress]);

  return (
    <Marker
      ref={setRef}
      coordinate={{ latitude: lat, longitude: lng }}
      pinColor={visited ? colors.onsenVisited : undefined}
      tracksViewChanges={tracksViewChanges}
    >
      {/* `tooltip` strips the native balloon chrome so the card below is the whole
          callout, giving full control over its look on Apple Maps. */}
      <Callout tooltip onPress={handleCalloutPress}>
        <View style={styles.callout}>
          <View style={styles.body}>
            {imageUrl !== null && (
              <Image
                source={{ uri: imageUrl }}
                style={styles.thumb}
                resizeMode="cover"
                onLoadEnd={stopTracking}
              />
            )}
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {areaName}・{prefecture}
              </Text>
              {admissionFee !== null && (
                <View style={styles.feeRow}>
                  <Ionicons
                    name="pricetag-outline"
                    size={typography.sizes.xs}
                    color={colors.textMuted}
                  />
                  <Text style={styles.fee} numberOfLines={1}>
                    {admissionFee}
                  </Text>
                </View>
              )}
              {visited && (
                <View style={styles.visitedRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={typography.sizes.sm}
                    color={colors.onsenVisited}
                  />
                  <Text style={styles.visitedText} numberOfLines={1}>
                    {t('map.previewVisited')}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.detailsRow}>
            <Text style={styles.detailsText}>{t('map.previewViewDetails')}</Text>
            <Ionicons
              name="chevron-forward"
              size={typography.sizes.sm}
              color={colors.actionPrimary}
            />
          </View>
        </View>
      </Callout>
    </Marker>
  );
}

export default memo(OnsenMarker);

const styles = StyleSheet.create({
  // The whole callout card. `tooltip` removed the native balloon, so this view
  // is the balloon — a fixed-width rounded card with its own surface.
  callout: {
    width: spacing[12] * 5,
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
  },
  thumb: {
    width: spacing[12] + spacing[2],
    height: spacing[12] + spacing[2],
    borderRadius: radii.md,
    backgroundColor: colors.backgroundSecondary,
  },
  text: {
    flex: 1,
    gap: spacing[1],
  },
  name: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  fee: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
  },
  visitedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  visitedText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.onsenVisited,
  },
  // The "View details ›" affordance, separated from the body by a hairline.
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    paddingVertical: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  detailsText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimary,
  },
});
