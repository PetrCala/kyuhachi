import type { LatLng } from './geo';

/**
 * Decoder for the Google-encoded polyline that /journey_days stores its track
 * in. Mirror of `decodePolyline` in functions/src/util/track.ts, which is where
 * the encoder lives and where the round trip is tested; the website is outside
 * the npm workspace and can only import types from `@kyuhachi/shared`, never
 * runtime code, so this is a copy on purpose. Keep the two in step.
 *
 * The format: each coordinate is a zig-zagged varint delta from the previous
 * one, emitted five bits at a time into printable ASCII. Deltas between
 * consecutive points on a walk are metres, so most cost two characters, which
 * is why a day is ~2.6 KB here instead of the ~95 KB it took as an array of
 * {lat, lng} maps.
 */

/**
 * Decimal places the encoder used. Keep equal to POLYLINE_PRECISION in
 * functions/src/util/track.ts: decode at the wrong precision and the whole
 * track lands off the coast rather than failing visibly.
 */
const POLYLINE_PRECISION = 5;

export function decodePolyline(encoded: string): LatLng[] {
  const factor = 10 ** POLYLINE_PRECISION;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / factor, lng: lng / factor });
  }

  return points;
}
