import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { colors, typography, radii, shadows } from '@/theme';

// Fixed badge geometry (not spacing-scale): the numbered pin and its selected,
// enlarged variant, sized to comfortably hold a one/two-digit number.
const PIN_SIZE = 26;
const PIN_SIZE_SELECTED = 32;

interface FinderMarkerProps {
  /** Encounter order (1-based) — shown inside the pin and matching the list row. */
  index: number;
  lat: number;
  lng: number;
  /** Place name — the native callout title (Apple Maps data, untranslated). */
  label: string;
  /** Highlighted (enlarged, accent-coloured) when its list row is selected. */
  selected: boolean;
  /** Selects this result when the pin is tapped. Must be stable. */
  onPress: (index: number) => void;
}

/**
 * A numbered pin for a finder result. Memoized so the finder screen's re-renders
 * (the zoom slider streams the live altitude per gesture frame) don't re-attach
 * every pin. Custom marker views need a redraw to paint, so — like OnsenMarker —
 * we pulse `tracksViewChanges` on mount and whenever the badge's look changes
 * (selection), then switch it back off so the pin stays static during pans.
 */
function FinderMarker({ index, lat, lng, label, selected, onPress }: FinderMarkerProps) {
  const handlePress = useCallback(() => onPress(index), [index, onPress]);

  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    setTracksViewChanges(true);
    const handle = requestAnimationFrame(() => setTracksViewChanges(false));
    return () => cancelAnimationFrame(handle);
  }, [selected, index]);

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      title={label}
      tracksViewChanges={tracksViewChanges}
      onPress={handlePress}
      anchor={{ x: 0.5, y: 0.5 }}
      stopPropagation
    >
      <View style={[styles.pin, selected && styles.pinSelected, shadows.sm]}>
        <Text style={styles.pinText}>{index}</Text>
      </View>
    </Marker>
  );
}

export default memo(FinderMarker);

const styles = StyleSheet.create({
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.actionPrimary,
    borderWidth: 2,
    borderColor: colors.textInverted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSelected: {
    width: PIN_SIZE_SELECTED,
    height: PIN_SIZE_SELECTED,
    backgroundColor: colors.onsenVisited,
  },
  pinText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
  },
});
