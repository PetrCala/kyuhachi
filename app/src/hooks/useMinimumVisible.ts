import { useEffect, useRef, useState } from 'react';

/**
 * Stretches a visibility flag so whatever it gates stays on screen for at
 * least `minMs` once shown — the declarative counterpart of the visit save
 * flow's hold (see MIN_SAVE_VISIBLE_MS in edit-visit.tsx), for states like
 * Home's loading screen where the flag drops as soon as cached data lands
 * and the loader would otherwise read as a flash.
 *
 * Returns `visible` with its trailing edge delayed: flips to false only once
 * both `visible` is false and `minMs` has elapsed since the show began. A
 * flag that never turns true is never held.
 */
export function useMinimumVisible(visible: boolean, minMs: number): boolean {
  const [held, setHeld] = useState(false);
  // When the current showing started; null while hidden.
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (visible) {
      shownAtRef.current ??= Date.now();
      setHeld(true);
      return;
    }
    if (shownAtRef.current === null) return;
    const remaining = minMs - (Date.now() - shownAtRef.current);
    shownAtRef.current = null;
    if (remaining <= 0) {
      setHeld(false);
      return;
    }
    const timer = setTimeout(() => setHeld(false), remaining);
    return () => clearTimeout(timer);
  }, [visible, minMs]);

  return visible || held;
}
