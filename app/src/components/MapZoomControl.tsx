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

// We zoom by driving the Apple Maps camera altitude (metres above ground), since
// the camera `zoom` field is Google-Maps-only and a no-op on PROVIDER_DEFAULT.
// Lower altitude = closer in. The slider clamps to a comfortable browsing band;
// pinch can still reach beyond it.
export const MIN_ALTITUDE = 1_000; // knob at top — streets
export const MAX_ALTITUDE = 2_000_000; // knob at bottom — the whole region
const STEP_FACTOR = 2; // each +/- tap halves / doubles the altitude

const clampAltitude = (a: number) => Math.min(MAX_ALTITUDE, Math.max(MIN_ALTITUDE, a));

// Altitude is exponential in perceived zoom, so map it to the knob on a log scale.
const LOG_MIN = Math.log(MIN_ALTITUDE);
const LOG_SPAN = Math.log(MAX_ALTITUDE) - LOG_MIN;

/** Knob top-offset (px from track top) for an altitude. Top = in, bottom = out. */
const altitudeToOffset = (altitude: number) =>
  ((Math.log(clampAltitude(altitude)) - LOG_MIN) / LOG_SPAN) * TRACK_HEIGHT;

/** Inverse of {@link altitudeToOffset}: the altitude a knob offset represents. */
const offsetToAltitude = (offset: number) =>
  Math.exp(LOG_MIN + (offset / TRACK_HEIGHT) * LOG_SPAN);

interface MapZoomControlProps {
  mapRef: RefObject<MapView | null>;
  /** Seed used only for the knob's first paint, before the map reports a camera. */
  initialAltitude: number;
  /** Live camera altitude from the map's onRegionChangeComplete; keeps the knob in
   *  sync when the user pinches. Undefined until the first reading lands. */
  altitude: number | undefined;
  zoomInLabel: string;
  zoomOutLabel: string;
  style?: StyleProp<ViewStyle>;
  /** Called on any interaction with the control (knob drag start, +/- tap) so a
   *  parent auto-hide timer can treat the slider's own use as activity. */
  onActivity?: () => void;
}

/**
 * Vertical zoom slider, docked on the map's right edge (Mapy.com mobile style):
 * a draggable knob between a + and - end cap. Dragging the knob zooms the camera
 * live; tapping an end cap steps by a fixed factor. The knob follows pinch
 * gestures via the `altitude` prop, but never while a drag is in progress.
 */
export default function MapZoomControl({
  mapRef,
  initialAltitude,
  altitude,
  zoomInLabel,
  zoomOutLabel,
  style,
  onActivity,
}: MapZoomControlProps) {
  const knobY = useRef(
    new Animated.Value(altitudeToOffset(altitude ?? initialAltitude))
  ).current;
  // Plain mirrors of the animated value so the gesture handlers can read the
  // current knob position synchronously (Animated.Value has no getter).
  const offsetRef = useRef(altitudeToOffset(altitude ?? initialAltitude));
  const dragStartOffsetRef = useRef(0);
  const draggingRef = useRef(false);
  // Keep the latest onActivity in a ref so the once-built PanResponder and the
  // memoized stepZoom call the current callback, not the one captured first.
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;

  useEffect(() => {
    const id = knobY.addListener(({ value }) => {
      offsetRef.current = value;
    });
    return () => knobY.removeListener(id);
  }, [knobY]);

  // Follow the map when it reports a new altitude (pinch/pan settle) — but never
  // fight an in-progress drag, which owns the knob until released.
  useEffect(() => {
    if (altitude === undefined || draggingRef.current) return;
    Animated.timing(knobY, {
      toValue: altitudeToOffset(altitude),
      duration: 120,
      useNativeDriver: false,
    }).start();
  }, [altitude, knobY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        onActivityRef.current?.();
        draggingRef.current = true;
        // Grab the knob where it sits and drag relative to that — don't jump to
        // the touch point. (locationY is measured inside whichever child is hit,
        // so pressing the knob vs. the rail would report different origins.)
        knobY.stopAnimation();
        dragStartOffsetRef.current = offsetRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const next = Math.min(
          TRACK_HEIGHT,
          Math.max(0, dragStartOffsetRef.current + gesture.dy)
        );
        knobY.setValue(next);
        mapRef.current?.setCamera({ altitude: offsetToAltitude(next) });
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
    (zoomIn: boolean) => {
      onActivityRef.current?.();
      const current = offsetToAltitude(offsetRef.current);
      const next = clampAltitude(zoomIn ? current / STEP_FACTOR : current * STEP_FACTOR);
      Animated.timing(knobY, {
        toValue: altitudeToOffset(next),
        duration: 150,
        useNativeDriver: false,
      }).start();
      mapRef.current?.animateCamera({ altitude: next }, { duration: 200 });
    },
    [knobY, mapRef]
  );

  return (
    <View style={[styles.container, shadows.md, style]}>
      <Pressable
        onPress={() => stepZoom(true)}
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
        onPress={() => stepZoom(false)}
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
