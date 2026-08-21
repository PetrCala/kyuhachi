import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Longest edge, in pixels, a visit photo is stored at.
 *
 * A visit photo is only ever shown at screen scale: full width in a card's
 * photo strip, or full screen in the viewer. 2048px covers the largest of those
 * on a 3x device with room to spare, while an untouched iPhone frame is 4032px
 * and several megabytes. Downscaling costs nothing visible and cuts what the
 * upload, the feed, and the public website each move by roughly four fifths.
 */
export const PHOTO_MAX_EDGE = 2048;

/** JPEG quality for stored visit photos. */
export const PHOTO_QUALITY = 0.7;

/**
 * Returns a URI for `uri` scaled so its longest edge is at most
 * `PHOTO_MAX_EDGE`, re-encoded as JPEG. A photo already within that bound is
 * returned untouched: re-encoding it would only spend quality for nothing.
 *
 * `width`/`height` come from the picker's asset rather than being measured
 * here, and both edges are passed explicitly, so a portrait photo is bounded on
 * its long edge like a landscape one (resizing by width alone would leave a
 * portrait photo taller than the cap).
 */
export async function downscalePhoto(
  uri: string,
  width: number,
  height: number
): Promise<string> {
  const longest = Math.max(width, height);
  if (longest <= PHOTO_MAX_EDGE) return uri;

  const scale = PHOTO_MAX_EDGE / longest;
  const image = await ImageManipulator.manipulate(uri)
    .resize({ width: Math.round(width * scale), height: Math.round(height * scale) })
    .renderAsync();
  const result = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
  return result.uri;
}
