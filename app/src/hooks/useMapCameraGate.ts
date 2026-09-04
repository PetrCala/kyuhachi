import { useCallback, useEffect, useRef, useState } from 'react';

export type MapCameraCommand = () => void;

interface MapCameraGateOptions {
  /** The screen hosting the map is focused: not covered by a pushed screen and
   *  not a background tab. Inactive tab screens are detached from the native view
   *  hierarchy, so a command sent then hits a map that is not in any window. */
  focused: boolean;
  /** The native map has reported a non-zero layout. */
  laidOut: boolean;
  /** The map has reported `onMapReady`. */
  mapReady: boolean;
  /** Pause after the gate opens before queued commands replay: a map that has
   *  just (re)appeared is still laying out, and a camera command in that window
   *  is what MapKit never recovers from. */
  settleMs: number;
  /** Called after the settle each time the gate re-opens (not on its first
   *  opening) with nothing queued: the hook for a no-op camera "nudge". */
  onReopen?: () => void;
}

export interface MapCameraGate {
  /** True while commands run immediately. */
  ready: boolean;
  /** Run the command now if the gate is open and settled, otherwise hold it
   *  until it is. Stable for the hook's lifetime. */
  run: (command: MapCameraCommand) => void;
  /** How many commands are waiting. Stable for the hook's lifetime. */
  pending: () => number;
}

/**
 * Serialises imperative camera commands (`setCamera`, `animateCamera`,
 * `animateToRegion`) behind one question: is the native map in a window, laid
 * out, ready, and settled? While it isn't, commands queue in order and replay
 * once it is, so a "Show on map" focus that lands in the same commit as the tab
 * re-attaching, or a route that arrives while the Map tab is in the background,
 * can never drive the camera of a detached or unsized map.
 */
export function useMapCameraGate({
  focused,
  laidOut,
  mapReady,
  settleMs,
  onReopen,
}: MapCameraGateOptions): MapCameraGate {
  const open = focused && laidOut && mapReady;
  const queueRef = useRef<MapCameraCommand[]>([]);
  // Whether the settle has elapsed since the gate last opened. The ref is the
  // source of truth `run` reads synchronously (including from inside a replayed
  // command); the state only mirrors it for the returned `ready`.
  const settledRef = useRef(false);
  const [settled, setSettled] = useState(false);
  const openedBeforeRef = useRef(false);
  const onReopenRef = useRef(onReopen);
  onReopenRef.current = onReopen;

  useEffect(() => {
    if (!open) {
      settledRef.current = false;
      setSettled(false);
      return;
    }
    const timer = setTimeout(() => {
      settledRef.current = true;
      const hadQueued = queueRef.current.length > 0;
      // Drain until empty: a replayed command may enqueue a follow-up.
      while (queueRef.current.length > 0) {
        const command = queueRef.current.shift()!;
        command();
      }
      if (!hadQueued && openedBeforeRef.current) onReopenRef.current?.();
      openedBeforeRef.current = true;
      setSettled(true);
    }, settleMs);
    return () => clearTimeout(timer);
  }, [open, settleMs]);

  const run = useCallback((command: MapCameraCommand) => {
    if (settledRef.current) {
      command();
    } else {
      queueRef.current.push(command);
    }
  }, []);

  const pending = useCallback(() => queueRef.current.length, []);

  return { ready: open && settled, run, pending };
}
