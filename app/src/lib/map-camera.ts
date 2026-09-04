import type { Camera, Region } from 'react-native-maps';

/**
 * Guards for the values handed to the native map's camera commands.
 *
 * MapKit only rejects an invalid *centre*: a region whose span is NaN (a route
 * document with a missing bound, an arithmetic slip) or a camera whose altitude
 * is NaN sails straight through react-native-maps' own checks and can leave the
 * map with a camera it never recovers from: tiles still draw, but pan and pinch
 * are dead until the app reloads. Every camera command on the map screen runs
 * its arguments through one of these first and drops the command when they fail.
 */

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isLatitude = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= -90 && value <= 90;

const isLongitude = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= -180 && value <= 180;

/** A region with a valid centre and strictly positive, finite spans. */
export function isFiniteRegion(region: Region): boolean {
  return (
    isLatitude(region.latitude) &&
    isLongitude(region.longitude) &&
    isFiniteNumber(region.latitudeDelta) &&
    region.latitudeDelta > 0 &&
    isFiniteNumber(region.longitudeDelta) &&
    region.longitudeDelta > 0
  );
}

/**
 * A (possibly partial) camera whose provided fields are all finite. A missing
 * field is fine: react-native-maps fills it from the map's current camera.
 */
export function isFiniteCamera(camera: Partial<Camera>): boolean {
  if (camera.center !== undefined) {
    if (!isLatitude(camera.center.latitude) || !isLongitude(camera.center.longitude)) {
      return false;
    }
  }
  if (camera.altitude !== undefined && !(isFiniteNumber(camera.altitude) && camera.altitude > 0)) {
    return false;
  }
  if (camera.heading !== undefined && !isFiniteNumber(camera.heading)) return false;
  if (camera.pitch !== undefined && !isFiniteNumber(camera.pitch)) return false;
  if (camera.zoom !== undefined && !isFiniteNumber(camera.zoom)) return false;
  return true;
}
