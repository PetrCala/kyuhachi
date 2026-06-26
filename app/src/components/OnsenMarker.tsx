import { memo, useCallback, useEffect, useState, type ElementRef } from 'react';
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
   *  arriving "Show on map" focus can re-open this onsen's preview. Must be stable. */
  registerRef: (id: string, ref: ElementRef<typeof Marker> | null) => void;
  /** Selects this onsen — opening its preview half-sheet — when the pin is
   *  tapped. Must be stable. */
  onPress: (id: string) => void;
}

/**
 * A single onsen pin on the map. Memoized so that the map screen's frequent
 * re-renders — the zoom slider streams the live camera altitude on every frame
 * of a pinch or pan — do not re-render or re-attach all ~155 markers each frame.
 * Only the markers whose own props actually change (e.g. `visited` flips after a
 * check-in, or the pin is filtered out) re-render. Props are kept primitive and
 * the two callbacks stable so React.memo's shallow comparison holds.
 *
 * Tapping the pin selects the onsen — the map screen opens an image-forward
 * preview half-sheet over it. `title`/`description` feed the native callout (and
 * VoiceOver); the callout sits behind the sheet's backdrop while it's open, and
 * the map screen deselects the pin when the sheet closes so it doesn't linger —
 * and so a re-tap reopens the sheet rather than no-opping on a still-selected pin.
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
  const handlePress = useCallback(() => onPress(id), [id, onPress]);

  // Whether react-native-maps keeps redrawing this marker's native overlay.
  // Left on (the default) for all ~155 pins, the constant per-marker redraws
  // stall the iOS UI thread and make the map freeze intermittently. The pin only
  // needs to redraw when its appearance changes — i.e. when `visited` flips its
  // colour — so we pulse tracking on for a frame on mount and on each such
  // change, then switch it back off so the marker stays static the rest of the
  // time (including throughout pans and pinches).
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    setTracksViewChanges(true);
    const handle = requestAnimationFrame(() => setTracksViewChanges(false));
    return () => cancelAnimationFrame(handle);
  }, [visited]);

  return (
    <Marker
      ref={setRef}
      coordinate={{ latitude: lat, longitude: lng }}
      title={name}
      description={areaName}
      pinColor={visited ? colors.onsenVisited : undefined}
      tracksViewChanges={tracksViewChanges}
      // A pin tap selects the onsen and opens the preview half-sheet; the native
      // callout it pops is hidden behind the sheet, and the map screen deselects
      // this pin when the sheet closes (so it doesn't linger and a re-tap works).
      onPress={handlePress}
      stopPropagation
    />
  );
}

export default memo(OnsenMarker);
