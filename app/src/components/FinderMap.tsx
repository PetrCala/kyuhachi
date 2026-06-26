import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import MapZoomControl from '@/components/MapZoomControl';
import FinderMarker from '@/components/FinderMarker';
import { finderResultKey, type FinderResult } from '@/lib/finder';
import type { LatLng } from '@/lib/geo';
import { colors, spacing, radii, shadows } from '@/theme';

// Fixed map geometry. Collapsed height matches the onsen page's mini-map feel;
// the fallback frame is a city-ish span used when there are no pins to fit.
const COLLAPSED_HEIGHT = 180;
const FALLBACK_DELTA = 0.08;
const CORNER_BUTTON = 36;
// Metres per degree of latitude — seeds the zoom slider before the map reports a camera.
const INITIAL_ALTITUDE = FALLBACK_DELTA * 111_000;
const CENTER_DURATION_MS = 350;
const FIT_EDGE_PADDING = {
  top: spacing[6],
  right: spacing[6],
  bottom: spacing[6],
  left: spacing[6],
};

interface FinderMapProps {
  results: FinderResult[];
  /** The user's current (or dev-simulated) location. */
  userCoord: LatLng;
  /** Dev builds show a simulated dot; real builds use the native blue dot. */
  simulated: boolean;
  routeCoords: { latitude: number; longitude: number }[];
  selectedKey: string | null;
  /** Stable. Selects a result (by key) when its pin is tapped. */
  onSelect: (key: string) => void;
  expanded: boolean;
  /** Stable. Toggles between the small preview and the enlarged map. */
  onToggleExpand: () => void;
}

/**
 * The Finder's map preview. One `MapView` instance that resizes between a small,
 * non-interactive card (tap to enlarge) and a full, interactive map (with zoom +
 * a collapse button). It auto-frames the result pins + user, and recentres on the
 * pin whose row is selected. Kept as a single instance so the resize animates
 * without a remount flash.
 */
export default function FinderMap({
  results,
  userCoord,
  simulated,
  routeCoords,
  selectedKey,
  onSelect,
  expanded,
  onToggleExpand,
}: FinderMapProps) {
  const { t } = useTranslation();
  const mapRef = useRef<MapView>(null);
  const [altitude, setAltitude] = useState<number | undefined>(undefined);

  const initialRegion = {
    latitude: userCoord.lat,
    longitude: userCoord.lng,
    latitudeDelta: FALLBACK_DELTA,
    longitudeDelta: FALLBACK_DELTA,
  };

  const markers = useMemo(
    () =>
      results.map((r, i) => ({
        key: finderResultKey(r),
        index: i + 1,
        lat: r.poi.lat,
        lng: r.poi.lng,
        label: r.poi.name,
      })),
    [results]
  );

  // Stable pin-press handler (so memoized markers don't re-render every frame):
  // it reads the latest markers via a ref to map the tapped index → its key.
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const handleMarkerPress = useCallback(
    (index: number) => {
      const m = markersRef.current[index - 1];
      if (m) onSelect(m.key);
    },
    [onSelect]
  );

  // Frame all pins + the user whenever the result set changes; with no pins, sit
  // on a modest region around the user instead.
  useEffect(() => {
    if (markers.length === 0) {
      mapRef.current?.animateToRegion({
        latitude: userCoord.lat,
        longitude: userCoord.lng,
        latitudeDelta: FALLBACK_DELTA,
        longitudeDelta: FALLBACK_DELTA,
      });
      return;
    }
    const coords = markers.map((m) => ({ latitude: m.lat, longitude: m.lng }));
    coords.push({ latitude: userCoord.lat, longitude: userCoord.lng });
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: FIT_EDGE_PADDING,
      animated: true,
    });
  }, [markers, userCoord.lat, userCoord.lng]);

  // Recentre on the selected pin.
  useEffect(() => {
    if (!selectedKey) return;
    const m = markers.find((x) => x.key === selectedKey);
    if (!m) return;
    mapRef.current?.animateCamera(
      { center: { latitude: m.lat, longitude: m.lng } },
      { duration: CENTER_DURATION_MS }
    );
  }, [selectedKey, markers]);

  const readAltitude = useCallback(async () => {
    try {
      const camera = await mapRef.current?.getCamera();
      if (camera?.altitude !== undefined) setAltitude(camera.altitude);
    } catch {
      // Map gone or camera unavailable — keep the last known altitude.
    }
  }, []);

  return (
    <View style={expanded ? styles.expanded : styles.collapsed}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        // Collapsed: gestures are off (the frame stays put) but pins stay tappable,
        // and a tap on the empty map enlarges it. Markers stopPropagation so a pin
        // tap selects instead of expanding.
        scrollEnabled={expanded}
        zoomEnabled={expanded}
        rotateEnabled={expanded}
        pitchEnabled={expanded}
        onPress={expanded ? undefined : onToggleExpand}
        showsUserLocation={!simulated}
        onMapReady={readAltitude}
        onRegionChangeComplete={readAltitude}
      >
        {routeCoords.length >= 2 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={colors.actionPrimary}
            strokeWidth={spacing[1]}
          />
        )}
        {simulated && (
          <Marker
            coordinate={{ latitude: userCoord.lat, longitude: userCoord.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            title={t('finder.youAreHere')}
            tracksViewChanges={false}
          >
            <View style={styles.simDot} />
          </Marker>
        )}
        {markers.map((m) => (
          <FinderMarker
            key={m.key}
            index={m.index}
            lat={m.lat}
            lng={m.lng}
            label={m.label}
            selected={m.key === selectedKey}
            onPress={handleMarkerPress}
          />
        ))}
      </MapView>

      <Pressable
        style={styles.cornerButton}
        onPress={onToggleExpand}
        hitSlop={spacing[2]}
        accessibilityRole="button"
        accessibilityLabel={expanded ? t('finder.mapCollapse') : t('finder.mapExpand')}
      >
        <Ionicons
          name={expanded ? 'contract' : 'expand'}
          size={20}
          color={colors.textPrimary}
        />
      </Pressable>

      {expanded && (
        <MapZoomControl
          mapRef={mapRef}
          initialAltitude={INITIAL_ALTITUDE}
          altitude={altitude}
          zoomInLabel={t('map.zoomIn')}
          zoomOutLabel={t('map.zoomOut')}
          style={styles.zoom}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    height: COLLAPSED_HEIGHT,
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.backgroundSecondary,
  },
  expanded: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  cornerButton: {
    position: 'absolute',
    top: spacing[3],
    right: spacing[3],
    width: CORNER_BUTTON,
    height: CORNER_BUTTON,
    borderRadius: radii.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  zoom: {
    position: 'absolute',
    right: spacing[3],
    bottom: spacing[6],
  },
  simDot: {
    width: spacing[4],
    height: spacing[4],
    borderRadius: radii.full,
    backgroundColor: colors.brandGlyph,
    borderWidth: 2,
    borderColor: colors.textInverted,
  },
});
