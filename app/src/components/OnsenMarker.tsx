import { memo, useCallback } from 'react';
import { Marker } from 'react-native-maps';
import { colors } from '@/theme';

interface OnsenMarkerProps {
  id: string;
  lat: number;
  lng: number;
  /** Visited in the active challenge → bath-water-blue pin; otherwise default red. */
  visited: boolean;
  /** Selects this onsen — the map opens its preview sheet rather than navigating
   *  straight to detail. Must be stable. */
  onPress: (id: string) => void;
}

/**
 * A single onsen pin on the map. Memoized so that the map screen's frequent
 * re-renders — the zoom slider streams the live camera altitude on every frame
 * of a pinch or pan — do not re-render all ~155 markers each frame. Only the
 * markers whose own props actually change (e.g. `visited` flips after a check-in,
 * or the pin is filtered out) re-render. Props are kept primitive and the
 * callback stable so React.memo's shallow comparison holds.
 *
 * Tapping the pin selects the onsen (the map opens a preview sheet) instead of
 * showing the native callout, so no title/description/ref is set here.
 */
function OnsenMarker({ id, lat, lng, visited, onPress }: OnsenMarkerProps) {
  const handlePress = useCallback(() => onPress(id), [id, onPress]);

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      pinColor={visited ? colors.onsenVisited : undefined}
      onPress={handlePress}
    />
  );
}

export default memo(OnsenMarker);
