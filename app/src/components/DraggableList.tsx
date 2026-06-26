import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import {
  keysInSlotOrder,
  positionsFromKeys,
  reorderByMovingKey,
  slotForOffset,
} from '@/lib/drag-reorder';

/**
 * What `renderItem` receives so a row can wire up its own grab handle and react
 * to being the one under the finger.
 */
export interface DragRowState {
  /** The pan gesture for this row's grab handle. Wrap the handle in
   *  `<GestureDetector gesture={gesture}>` so a drag started there reorders this
   *  row. */
  gesture: PanGesture;
  /** True while this row is the one being dragged. */
  isActive: boolean;
}

interface DraggableListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  /** Uniform slot height in px, including the gap below each row. Drag math
   *  relies on every row being exactly this tall. */
  rowHeight: number;
  renderItem: (item: T, state: DragRowState) => ReactNode;
  /** Fired once on drop with the new key order, only when it actually changed. */
  onOrderChange: (orderedKeys: string[]) => void;
  /** Fired when a drag starts (true) and ends (false). Scroll coordination no
   *  longer needs this (see `scrollableRef`); kept for callers that want to
   *  react to a drag (e.g. haptics, chrome). */
  onDraggingChange?: (dragging: boolean) => void;
  /** Ref to the surrounding gesture-handler `ScrollView` (the one from
   *  `react-native-gesture-handler`, not RN core). A row drag is given precedence
   *  over it via `blocksExternalGesture`, so the page doesn't scroll out from
   *  under the gesture — and scrolling never has to be disabled. Must reference an
   *  RNGH-managed scrollable for the relation to attach to the real scroll. */
  scrollableRef?: RefObject<ComponentType | undefined | null>;
}

// Critically damped spring (no overshoot): neighbours shuffling aside and the
// dropped row settling both read as "snap into place", not a wobble. damping ≈
// 2·√(stiffness·mass) keeps it on the no-bounce side of critical.
const SPRING = { mass: 1, stiffness: 300, damping: 35 } as const;

/**
 * A vertically drag-reorderable list built on `react-native-gesture-handler`
 * (`Gesture.Pan`) + `react-native-reanimated` shared values. Rows keep a stable
 * mount order (keyed by `keyExtractor`) and are positioned purely by an animated
 * `translateY`, so reordering never remounts a row. Assumes every row is exactly
 * `rowHeight` tall.
 *
 * The drag is started from a handle (the `gesture` in `DragRowState`), not the
 * whole row, so it never competes with a row's own tap target; passing the
 * surrounding scroll's `scrollableRef` lets the drag take precedence over the
 * scroll without ever disabling scrolling.
 */
export default function DraggableList<T>({
  items,
  keyExtractor,
  rowHeight,
  renderItem,
  onOrderChange,
  onDraggingChange,
  scrollableRef,
}: DraggableListProps<T>) {
  const keys = items.map(keyExtractor);
  const keySignature = keys.join(' ');

  // positions: row key -> slot index (0 = top). The canonical layout, mutated on
  // the UI thread during a drag and snapped to the incoming data otherwise.
  const positions = useSharedValue<Record<string, number>>(positionsFromKeys(keys));
  // The row under the finger (null when idle) and its live translateY, both read
  // by every row's animated style to decide "follow the finger" vs "spring to
  // slot". `activeStartTop` is the row's translateY at grab time, so the finger
  // offset maps to an absolute position even as the row's own slot shifts.
  const activeKey = useSharedValue<string | null>(null);
  const activeTranslateY = useSharedValue(0);
  const activeStartTop = useSharedValue(0);
  // Gate the spring: reorders during a drag animate; external data syncs snap.
  const animateReorder = useSharedValue(false);
  // Worklet-visible mirrors of props (props can't be read on the UI thread).
  const rowHeightSV = useSharedValue(rowHeight);
  const countSV = useSharedValue(items.length);

  // Drives per-row lift styling (shadow, scale, z-order) — the JS-thread twin of
  // `activeKey`, since `renderItem` and `zIndex` live on the JS side.
  const [activeKeyState, setActiveKeyState] = useState<string | null>(null);

  // True from grab until the drop spring finishes; gates the data-sync effect so
  // an incoming snapshot can't fight an in-flight drag.
  const dragging = useRef(false);
  // Latest values read by the (stable) drag callbacks without rebuilding gestures.
  const keysRef = useRef<string[]>(keys);
  keysRef.current = keys;
  const onOrderChangeRef = useRef(onOrderChange);
  onOrderChangeRef.current = onOrderChange;
  const onDraggingChangeRef = useRef(onDraggingChange);
  onDraggingChangeRef.current = onDraggingChange;

  // One Pan gesture per key, created lazily and reused — recreating the gesture
  // object would re-attach the detector mid-drag. The worklets read all live
  // state from shared values, so a gesture never needs rebuilding.
  const gestures = useRef(new Map<string, PanGesture>()).current;

  const handleDragStart = useCallback((key: string) => {
    dragging.current = true;
    setActiveKeyState(key);
    onDraggingChangeRef.current?.(true);
  }, []);

  const handleDragEnd = useCallback((finalOrder: string[]) => {
    dragging.current = false;
    setActiveKeyState(null);
    onDraggingChangeRef.current?.(false);
    const before = keysRef.current;
    const changed =
      before.length !== finalOrder.length || before.some((k, i) => k !== finalOrder[i]);
    if (changed) onOrderChangeRef.current(finalOrder);
  }, []);

  function gestureFor(key: string): PanGesture {
    let gesture = gestures.get(key);
    if (!gesture) {
      let pan = Gesture.Pan()
        .onStart(() => {
          'worklet';
          activeKey.value = key;
          const startSlot = positions.value[key] ?? 0;
          activeStartTop.value = startSlot * rowHeightSV.value;
          activeTranslateY.value = activeStartTop.value;
          runOnJS(handleDragStart)(key);
        })
        .onUpdate((event) => {
          'worklet';
          const top = activeStartTop.value + event.translationY;
          activeTranslateY.value = top;
          animateReorder.value = true;
          const target = slotForOffset(top, rowHeightSV.value, countSV.value);
          positions.value = reorderByMovingKey(positions.value, key, target);
        })
        .onFinalize(() => {
          'worklet';
          if (activeKey.value !== key) return;
          const finalOrder = keysInSlotOrder(positions.value);
          const finalSlot = positions.value[key] ?? 0;
          // Settle the dropped row into its slot, then (and only then) clear the
          // active state and report the new order — the lift persists through the
          // settle, exactly as the old PanResponder version did.
          activeTranslateY.value = withSpring(finalSlot * rowHeightSV.value, SPRING, (finished) => {
            if (finished) {
              activeKey.value = null;
              runOnJS(handleDragEnd)(finalOrder);
            }
          });
        });
      // Take precedence over the surrounding scroll while a handle drag is live.
      if (scrollableRef) pan = pan.blocksExternalGesture(scrollableRef);
      gesture = pan;
      gestures.set(key, gesture);
    }
    return gesture;
  }

  // Sync to the incoming order whenever the data changes — but never mid-drag.
  // Positions snap (no animation): an external change (import, delete, remote
  // edit) should land immediately, the way a re-rendered list would.
  useEffect(() => {
    rowHeightSV.value = rowHeight;
    countSV.value = items.length;
    if (dragging.current) return;
    animateReorder.value = false;
    positions.value = positionsFromKeys(keys);
    // Drop gestures for rows that went away.
    const present = new Set(keys);
    for (const key of gestures.keys()) if (!present.has(key)) gestures.delete(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySignature, rowHeight]);

  return (
    <View style={{ height: items.length * rowHeight }}>
      {items.map((item, index) => {
        const key = keyExtractor(item);
        return (
          <DragRow
            key={key}
            item={item}
            itemKey={key}
            index={index}
            rowHeight={rowHeight}
            positions={positions}
            activeKey={activeKey}
            activeTranslateY={activeTranslateY}
            animateReorder={animateReorder}
            isActive={key === activeKeyState}
            gesture={gestureFor(key)}
            renderItem={renderItem}
          />
        );
      })}
    </View>
  );
}

interface DragRowProps<T> {
  item: T;
  itemKey: string;
  /** Display index, used only as the translateY fallback for a row whose key
   *  isn't in `positions` yet (a fresh item between render and the sync effect),
   *  so it paints at its slot rather than flashing through 0. */
  index: number;
  rowHeight: number;
  positions: SharedValue<Record<string, number>>;
  activeKey: SharedValue<string | null>;
  activeTranslateY: SharedValue<number>;
  animateReorder: SharedValue<boolean>;
  isActive: boolean;
  gesture: PanGesture;
  renderItem: (item: T, state: DragRowState) => ReactNode;
}

function DragRow<T>({
  item,
  itemKey,
  index,
  rowHeight,
  positions,
  activeKey,
  activeTranslateY,
  animateReorder,
  isActive,
  gesture,
  renderItem,
}: DragRowProps<T>) {
  const animatedStyle = useAnimatedStyle(() => {
    if (activeKey.value === itemKey) {
      // The row in hand follows the finger directly (no spring).
      return { transform: [{ translateY: activeTranslateY.value }] };
    }
    // Everyone else sits at their slot: springs there during a drag-reorder,
    // snaps there on an external data change.
    const target = (positions.value[itemKey] ?? index) * rowHeight;
    return {
      transform: [{ translateY: animateReorder.value ? withSpring(target, SPRING) : target }],
    };
  });

  return (
    <Animated.View
      style={[styles.row, { height: rowHeight, zIndex: isActive ? 2 : 1 }, animatedStyle]}
    >
      {renderItem(item, { gesture, isActive })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
});
