import { useRef, useEffect, useCallback, useMemo, type RefObject } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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

// While the knob is dragged it rides the UI thread and updates every frame, but
// moving the map camera is a JS→native bridge call. Throttle that call to a
// steady cadence (~30 fps) so the bridge stays clear and the knob never stutters
// even on a fast drag; the drag's end always lands the camera on the final knob
// position, so the cap never leaves the two out of step.
const CAMERA_FOLLOW_INTERVAL_MS = 1000 / 30;

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
 *
 * The knob position is a reanimated shared value driven by a gesture-handler pan
 * on the UI thread, so it tracks the finger frame-for-frame; the camera follow
 * (a JS bridge call) is throttled off that, decoupled from the knob's motion.
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
  // Knob position in px from the track top (0 = zoomed in, TRACK_HEIGHT = out),
  // animated on the UI thread. `dragStartOffset` anchors a drag to where the knob
  // sat so it moves relative to that point rather than jumping to the touch.
  const knobY = useSharedValue(altitudeToOffset(altitude ?? initialAltitude));
  const dragStartOffset = useSharedValue(0);

  // Whether a knob drag is in progress, kept on the JS thread (flipped from the
  // gesture via runOnJS) so the pinch-follow effect below can read it
  // synchronously and yield the knob to the drag.
  const draggingRef = useRef(false);
  // Keep the latest onActivity in a ref so the once-built gesture and the
  // memoized stepZoom call the current callback, not the one captured first.
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;

  // Throttle bookkeeping for the camera follow: the last time we moved the camera
  // and the latest knob offset seen this drag. `null` means "no move yet", so a
  // tap that never drags leaves the camera untouched (matching the old responder).
  const lastCameraAtRef = useRef(0);
  const pendingOffsetRef = useRef<number | null>(null);

  const moveCamera = useCallback(
    (offset: number) => {
      mapRef.current?.setCamera({ altitude: offsetToAltitude(offset) });
    },
    [mapRef]
  );

  // Touch-down: count it as activity and reset the throttle so the first drag
  // frame moves the camera immediately.
  const handleDragStart = useCallback(() => {
    onActivityRef.current?.();
    draggingRef.current = true;
    pendingOffsetRef.current = null;
    lastCameraAtRef.current = 0;
  }, []);

  // Every move frame: record the latest knob offset and move the camera at most
  // once per throttle interval.
  const handleDragMove = useCallback(
    (offset: number) => {
      pendingOffsetRef.current = offset;
      const now = Date.now();
      if (now - lastCameraAtRef.current < CAMERA_FOLLOW_INTERVAL_MS) return;
      lastCameraAtRef.current = now;
      moveCamera(offset);
    },
    [moveCamera]
  );

  // Drag end (release or terminate): release the knob back to the pinch-follow
  // effect, then land the camera on the knob's final position so a frame
  // throttled out at the very end can't leave them apart. A pure tap (no move)
  // left pendingOffset null, so it never touches the camera.
  const handleDragEnd = useCallback(() => {
    draggingRef.current = false;
    if (pendingOffsetRef.current === null) return;
    moveCamera(pendingOffsetRef.current);
    pendingOffsetRef.current = null;
  }, [moveCamera]);

  // Follow the map when it reports a new altitude (pinch/pan settle) — but never
  // fight an in-progress drag, which owns the knob until released.
  useEffect(() => {
    if (altitude === undefined || draggingRef.current) return;
    knobY.value = withTiming(altitudeToOffset(altitude), { duration: 120 });
  }, [altitude, knobY]);

  // The pan runs on the UI thread: it sets the knob's shared value directly (so
  // the knob tracks the finger frame-for-frame) and hands the camera off to JS at
  // the throttled cadence. Memoized so MapZoomControl's per-frame re-renders (the
  // parent streams the live altitude on every gesture frame) never tear down and
  // re-attach the native gesture. minDistance(0) keeps the grab immediate, like
  // the old PanResponder, with no activation slop before the knob responds.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin(() => {
          dragStartOffset.value = knobY.value;
          runOnJS(handleDragStart)();
        })
        .onUpdate((event) => {
          const next = Math.min(
            TRACK_HEIGHT,
            Math.max(0, dragStartOffset.value + event.translationY)
          );
          knobY.value = next;
          runOnJS(handleDragMove)(next);
        })
        .onFinalize(() => {
          runOnJS(handleDragEnd)();
        }),
    [knobY, dragStartOffset, handleDragStart, handleDragMove, handleDragEnd]
  );

  const stepZoom = useCallback(
    (zoomIn: boolean) => {
      onActivityRef.current?.();
      const current = offsetToAltitude(knobY.value);
      const next = clampAltitude(zoomIn ? current / STEP_FACTOR : current * STEP_FACTOR);
      knobY.value = withTiming(altitudeToOffset(next), { duration: 150 });
      mapRef.current?.animateCamera({ altitude: next }, { duration: 200 });
    },
    [knobY, mapRef]
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: knobY.value }],
  }));

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

      <GestureDetector gesture={panGesture}>
        <View style={styles.track}>
          <View style={styles.rail} />
          <Animated.View style={[styles.knob, shadows.sm, knobStyle]} />
        </View>
      </GestureDetector>

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
