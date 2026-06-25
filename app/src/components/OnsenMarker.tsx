import { memo, useCallback } from 'react';
import { Marker } from 'react-native-maps';
import { colors } from '@/theme';

interface OnsenMarkerProps {
  id: string;
  lat: number;
  lng: number;
  /** Onsen name — the pin's accessible title (Firestore data, untranslated). */
  name: string;
  /** Visited in the active challenge → bath-water-blue pin; otherwise default red. */
  visited: boolean;
  /** Selects this onsen — the map screen pops its floating peek card. Tapping the
   *  card (not the pin) is what opens the detail screen. Must be stable. */
  onSelect: (id: string) => void;
}

/**
 * A single onsen pin on the map. Memoized so that the map screen's frequent
 * re-renders — the zoom slider streams the live camera altitude on every frame
 * of a pinch or pan — do not re-render all ~155 markers each frame. Only the
 * markers whose own props actually change (e.g. `visited` flips after a check-in,
 * or the pin is filtered out) re-render. Props are kept primitive and `onSelect`
 * stable so React.memo's shallow comparison holds.
 */
function OnsenMarker({ id, lat, lng, name, visited, onSelect }: OnsenMarkerProps) {
  // Tapping the pin selects this onsen so the map shows its peek card (instead of
  // the default native callout), then bubbles the selection up.
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      title={name}
      pinColor={visited ? colors.onsenVisited : undefined}
      onPress={handlePress}
    />
  );
}

export default memo(OnsenMarker);
