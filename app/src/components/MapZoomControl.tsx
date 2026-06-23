import { useRef, useEffect, useCallback, type RefObject } from 'react';
import {
  View,
  Pressable,
  Animated,
  PanResponder,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type MapView from 'react-native-maps';
import { colors, radii, spacing, shadows } from '@/theme';

// Fixed control geometry (not part of the spacing scale): the +/- end caps, the
// distance the knob can travel, and the knob itself are tuned to this pill, so
// they live here as constants the way RecordVisitFab keeps its FAB dimensions.
const BUTTON_SIZE = 36; // tap target for each +/- end cap
const GLYPH_SIZE = 20; // the +/- icon
const TRACK_HEIGHT = 132; // px the knob travels: top = zoomed in, bottom = out
const KNOB_SIZE = 22;
const RAIL_WIDTH = 3;

// Slider zoom band. Apple Maps supports a wider span; we clamp the knob to the
// range that's useful for browsing Kyushu and let pinch reach the extremes.
const MIN_ZOOM = 4;
const MAX_ZOOM = 18;
const ZOOM_STEP = 1; // how much a +/- tap changes the zoom

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Knob top-offset (px from track top) for a given zoom. Top = max, bottom = min. */
const zoomToOffset = (z: number) =>
  ((MAX_ZOOM - clampZoom(z)) / (MAX_ZOOM - MIN_ZOOM)) * TRACK_HEIGHT;

/** Inverse of {@link zoomToOffset}: the zoom a knob offset represents. */
const offsetToZoom = (offset: number) =>
  MAX_ZOOM - (offset / TRACK_HEIGHT) * (MAX_ZOOM - MIN_ZOOM);

interface MapZoomControlProps {
  mapRef: RefObject<MapView | null>;
  /** Seed used only for the knob's first paint, before the map reports a zoom. */
  initialZoom: number;
  /** Live camera zoom from the map's onRegionChangeComplete; keeps the knob in
   *  sync when the user pinches. Undefined until the first reading lands. */
  zoom: number | undefined;
  zoomInLabel: string;
  zoomOutLabel: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Vertical zoom slider, docked on the map's right edge (Mapy.com mobile style):
 * a draggable knob between a + and - end cap. Dragging the knob zooms the camera
 * live; tapping an end cap steps by one level. The knob follows pinch gestures
 * via the `zoom` prop, but never while a drag is in progress.
 */
export default function MapZoomControl({
  mapRef,
  initialZoom,
  zoom,
  zoomInLabel,
  zoomOutLabel,
  style,
}: MapZoomControlProps) {
  const knobY = useRef(new Animated.Value(zoomToOffset(zoom ?? initialZoom))).current;
  // Plain mirrors of the animated value so the gesture handlers can read the
  // current knob position synchronously (Animated.Value has no getter).
  const offsetRef = useRef(zoomToOffset(zoom ?? initialZoom));
  const dragStartOffsetRef = useRef(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    const id = knobY.addListener(({ value }) => {
      offsetRef.current = value;
    });
    return () => knobY.removeListener(id);
  }, [knobY]);

  // Follow the map when it reports a new zoom (pinch/pan settle) — but never
  // fight an in-progress drag, which owns the knob until released.
  useEffect(() => {
    if (zoom === undefined || draggingRef.current) return;
    Animated.timing(knobY, {
      toValue: zoomToOffset(zoom),
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, [zoom, knobY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        draggingRef.current = true;
        // Center the knob on the touch so a tap on the rail jumps there, then
        // drags relative to that point.
        const base = Math.min(
          TRACK_HEIGHT,
          Math.max(0, evt.nativeEvent.locationY - KNOB_SIZE / 2)
        );
        dragStartOffsetRef.current = base;
        knobY.setValue(base);
        mapRef.current?.setCamera({ zoom: offsetToZoom(base) });
      },
      onPanResponderMove: (_evt, gesture) => {
        const next = Math.min(
          TRACK_HEIGHT,
          Math.max(0, dragStartOffsetRef.current + gesture.dy)
        );
        knobY.setValue(next);
        mapRef.current?.setCamera({ zoom: offsetToZoom(next) });
      },
      onPanResponderRelease: () => {
        draggingRef.current = false;
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false;
      },
    })
  ).current;

  const stepZoom = useCallback(
    (delta: number) => {
      const next = clampZoom(offsetToZoom(offsetRef.current) + delta);
      Animated.timing(knobY, {
        toValue: zoomToOffset(next),
        duration: 150,
        useNativeDriver: true,
      }).start();
      mapRef.current?.animateCamera({ zoom: next }, { duration: 200 });
    },
    [knobY, mapRef]
  );

  return (
    <View style={[styles.container, shadows.md, style]}>
      <Pressable
        onPress={() => stepZoom(ZOOM_STEP)}
        hitSlop={spacing[1]}
        accessibilityRole="button"
        accessibilityLabel={zoomInLabel}
        style={styles.button}
      >
        <Ionicons name="add" size={GLYPH_SIZE} color={colors.textPrimary} />
      </Pressable>

      <View style={styles.track} {...panResponder.panHandlers}>
        <View style={styles.rail} />
        <Animated.View
          style={[styles.knob, shadows.sm, { transform: [{ translateY: knobY }] }]}
        />
      </View>

      <Pressable
        onPress={() => stepZoom(-ZOOM_STEP)}
        hitSlop={spacing[1]}
        accessibilityRole="button"
        accessibilityLabel={zoomOutLabel}
        style={styles.button}
      >
        <Ionicons name="remove" size={GLYPH_SIZE} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: BUTTON_SIZE,
    paddingVertical: spacing[1],
    borderRadius: radii.full,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    width: BUTTON_SIZE,
    height: TRACK_HEIGHT + KNOB_SIZE,
    alignItems: 'center',
  },
  rail: {
    position: 'absolute',
    top: KNOB_SIZE / 2,
    width: RAIL_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: radii.full,
    backgroundColor: colors.separator,
  },
  knob: {
    position: 'absolute',
    top: 0,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.actionPrimary,
  },
});
