import { useSyncExternalStore } from 'react';

/**
 * Matches the phone breakpoint the map cards use in styles.css. The two have to
 * agree: the CSS turns the cards into pills here and this decides whether they
 * start open, so a mismatch leaves an expanded card laid out as a pill.
 *
 * The height half is for a phone held sideways, which is 812px wide and so
 * clears the width test while having barely 300px of map under the header.
 */
export const NARROW_QUERY = '(max-width: 700px), (max-height: 500px)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(NARROW_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}

/** True on phone-width viewports. */
export function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
