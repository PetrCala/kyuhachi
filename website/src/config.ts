/**
 * The one uid whose journey is public. Must match isJourneyUser() in
 * firebase/firestore.rules; nothing else about the site is user-specific.
 */
export const JOURNEY_UID = 'juEfBPJSspS9E2dqMzRac07C1Gs1';

/** OpenFreeMap vector base style (no API key, no usage caps). */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Kyushu, roughly: the initial view before any data arrives. [west, south], [east, north]. */
export const KYUSHU_BOUNDS: [[number, number], [number, number]] = [
  [129.3, 30.9],
  [132.3, 34.1],
];
