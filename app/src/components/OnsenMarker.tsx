import { memo, useCallback, type ElementRef } from 'react';
import { Marker } from 'react-native-maps';
import { colors } from '@/theme';

interface OnsenMarkerProps {
  id: string;
  lat: number;
  lng: number;
  /** Onsen name — shown as the callout title (Firestore data, untranslated). */
  name: string;
  /** Area name — shown as the callout subtitle (Firestore data, untranslated). */
  areaName: string;
  /** Visited in the active challenge → bath-water-blue pin; otherwise default red. */
  visited: boolean;
  /** Registers this marker's imperative handle with the parent (keyed by id) so an
   *  arriving "Show on map" focus can pop the matching callout. Must be stable. */
  registerRef: (id: string, ref: ElementRef<typeof Marker> | null) => void;
  /** Opens the onsen detail screen when its callout is tapped. Must be stable. */
  onPress: (id: string) => void;
}

/**
 * A single onsen pin on the map. Memoized so that the map screen's frequent
 * re-renders — the zoom slider streams the live camera altitude on every frame
 * of a pinch or pan — do not re-render or re-attach all ~155 markers each frame.
 * Only the markers whose own props actually change (e.g. `visited` flips after a
 * check-in, or the pin is filtered out) re-render. Props are kept primitive and
 * the two callbacks stable so React.memo's shallow comparison holds.
 */
function OnsenMarker({
  id,
  lat,
  lng,
  name,
  areaName,
  visited,
  registerRef,
  onPress,
}: OnsenMarkerProps) {
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
      title={name}
      description={areaName}
      pinColor={visited ? colors.onsenVisited : undefined}
      onCalloutPress={handleCalloutPress}
    />
  );
}

export default memo(OnsenMarker);
