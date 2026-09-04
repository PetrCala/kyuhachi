import type { Camera } from 'react-native-maps';
import { isFiniteCamera } from '@/lib/map-camera';
import { hasDuplicateTabLayout } from '@/hooks/useSingleTabLayoutAssertion';

/**
 * Everything the map screen knows about its own state at the moment the map
 * doctor is asked for a report. Timestamps are `Date.now()` values, 0 for never.
 */
export interface MapDoctorInput {
  now: number;
  focused: boolean;
  laidOut: boolean;
  mapReady: boolean;
  /** The camera command gate is open and settled. */
  gateReady: boolean;
  /** Camera commands waiting on the gate. */
  queued: number;
  /** How many times the MapView has been (re)mounted this screen life. */
  instance: number;
  lastPressAt: number;
  lastRegionChangeAt: number;
  lastRegionCompleteAt: number;
  /** The live camera, or null when the read failed or timed out. */
  camera: Camera | null;
  /** Why the camera read failed, when it did. */
  cameraError: string | null;
  sheet: 'none' | 'open' | 'closing';
  /** Root-stack route names, oldest first. */
  rootRoutes: string[];
}

/** Resolve a promise or fail after `ms`: a native read that never settles must
 *  not hang the report. */
export function withTimeout<T>(promise: Promise<T> | undefined, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!promise) {
      reject(new Error('no map ref'));
      return;
    }
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function age(now: number, at: number): string {
  return at ? `${((now - at) / 1000).toFixed(1)}s ago` : 'never';
}

/**
 * The map doctor's report: one line per layer that can freeze the map, so a
 * single screenshot on device says which layer to look at. Read it as:
 *
 *  - touches reach MapKit but the camera is not finite: camera corruption
 *    (a command hit an unsized/detached map, or bad numbers got through);
 *  - no touch event arrives at all while RN buttons still tap: something is
 *    on top of the map (a mounted sheet) or MapKit's gesture state is stuck;
 *  - a duplicate tab layout: a root-level screen navigated into the tabs.
 */
export function formatMapDoctorReport(input: MapDoctorInput): string {
  const cameraLine = input.camera
    ? `center ${input.camera.center.latitude.toFixed(4)}, ${input.camera.center.longitude.toFixed(4)}; ` +
      `altitude ${input.camera.altitude === undefined ? '?' : Math.round(input.camera.altitude)} m; ` +
      (isFiniteCamera(input.camera) ? 'finite' : 'NOT FINITE')
    : `read failed (${input.cameraError ?? 'unknown'})`;
  const duplicate = hasDuplicateTabLayout(input.rootRoutes);
  return [
    `map: focused=${input.focused} laidOut=${input.laidOut} mapReady=${input.mapReady} ` +
      `gate=${input.gateReady ? 'open' : 'closed'} queued=${input.queued} instance=${input.instance}`,
    `events: onPress ${age(input.now, input.lastPressAt)}; ` +
      `onRegionChange ${age(input.now, input.lastRegionChangeAt)}; ` +
      `onRegionChangeComplete ${age(input.now, input.lastRegionCompleteAt)}`,
    `camera: ${cameraLine}`,
    `preview sheet: ${input.sheet}`,
    `root stack: ${input.rootRoutes.join(' > ') || '(unknown)'}${duplicate ? '  DUPLICATE TAB LAYOUT' : ''}`,
    'Now check by hand: does the tab bar tap? does the onsen list scroll?',
  ].join('\n');
}
