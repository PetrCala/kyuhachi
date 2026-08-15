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

/**
 * GSI (国土地理院) hillshade raster tiles, the optional terrain layer.
 * https://maps.gsi.go.jp/development/ichiran.html
 */
export const GSI_HILLSHADE_TILES =
  'https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png';
export const GSI_ATTRIBUTION = '国土地理院';

/**
 * An eligible onsen within this distance of the planned route counts as
 * "planned". Same idea as the app's along-the-route corridor filtering, wider
 * because an onsen is a destination worth a detour, not a roadside stop.
 */
export const PLANNED_ROUTE_CORRIDOR_KM = 3;
