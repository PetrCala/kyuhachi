/**
 * Manual fallback for the Strava journey sync: turn a GPX file into the same
 * /journey_days/{date} document the scheduled stravaSync function writes.
 *
 * For days where the Strava recording is corrupt or missing entirely. Once a
 * day's document carries source: "gpx", the daily sync leaves it alone, so a
 * manual fix is never overwritten the next morning.
 *
 * The exact same privacy trimming applies as in the sync: points within
 * ~500 m of the track's start and end are dropped before anything is written
 * (functions/src/util/track.ts), so overnight locations never publish.
 *
 * === Running ===
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json \
 *   npm run journey:import-gpx -- /path/to/day.gpx [--date YYYY-MM-DD]
 *
 * The service account key is the same one the seed scripts use:
 * https://console.firebase.google.com/project/kyuhachi-fddcc/settings/serviceaccounts/adminsdk
 * Store it outside the repository.
 *
 * --date overrides the day the track is filed under; without it the day is
 * derived from the file's first <time> element, converted to JST.
 */

import { readFileSync } from 'fs';
import * as admin from 'firebase-admin';
import { DOMParser } from '@xmldom/xmldom';
import { gpx } from '@tmcw/togeojson';
import type { Feature, Geometry, LineString, MultiLineString, Position } from 'geojson';
import {
  boundsOf,
  simplifyTrack,
  totalDistanceMeters,
  trimEnds,
  TRIM_RADIUS_METERS,
  type JourneyDayData,
  type LatLng,
} from '../functions/src/util/track';

const PROJECT_ID = 'kyuhachi-fddcc';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseArgs(): { filePath: string; dateOverride: string | null } {
  const args = process.argv.slice(2);
  let filePath: string | null = null;
  let dateOverride: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date') {
      dateOverride = args[++i] ?? null;
    } else if (!filePath) {
      filePath = args[i];
    } else {
      fail(`unexpected argument: ${args[i]}`);
    }
  }
  if (!filePath) fail('usage: npm run journey:import-gpx -- /path/to/day.gpx [--date YYYY-MM-DD]');
  if (dateOverride && !/^\d{4}-\d{2}-\d{2}$/.test(dateOverride)) {
    fail(`--date must be YYYY-MM-DD, got: ${dateOverride}`);
  }
  return { filePath, dateOverride };
}

interface ParsedGpx {
  points: LatLng[];
  /** Epoch millis of the first/last timestamped trackpoints, when present. */
  startMs: number | null;
  endMs: number | null;
}

function parseGpx(text: string): ParsedGpx {
  const doc = new DOMParser().parseFromString(text, 'text/xml') as unknown as Document;
  if (!doc?.documentElement) fail('unreadable GPX file');
  const collection = gpx(doc);

  const track = collection.features.find(
    (f: Feature<Geometry | null>): f is Feature<LineString | MultiLineString> =>
      f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'
  );
  if (!track) fail('no track found in the GPX file');

  const positions: Position[] =
    track.geometry.type === 'LineString'
      ? track.geometry.coordinates
      : track.geometry.coordinates.flat();
  const points: LatLng[] = [];
  for (const [lng, lat] of positions) {
    if (Number.isFinite(lat) && Number.isFinite(lng)) points.push({ lat, lng });
  }
  if (points.length < 2) fail('the track has fewer than two usable points');

  // togeojson lifts <time> per point into properties.coordinateProperties.times
  // (nested per segment for MultiLineString).
  const rawTimes: unknown = track.properties?.coordinateProperties?.times;
  const flatTimes: string[] = Array.isArray(rawTimes)
    ? (rawTimes.flat() as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  const startMs = flatTimes.length > 0 ? Date.parse(flatTimes[0]) : NaN;
  const endMs = flatTimes.length > 0 ? Date.parse(flatTimes[flatTimes.length - 1]) : NaN;

  return {
    points,
    startMs: Number.isFinite(startMs) ? startMs : null,
    endMs: Number.isFinite(endMs) ? endMs : null,
  };
}

/** The JST calendar day of an epoch-millis instant, as YYYY-MM-DD. */
function jstDay(epochMs: number): string {
  return new Date(epochMs + JST_OFFSET_MS).toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const { filePath, dateOverride } = parseArgs();
  const parsed = parseGpx(readFileSync(filePath, 'utf8'));

  const date =
    dateOverride ??
    (parsed.startMs != null
      ? jstDay(parsed.startMs)
      : fail('the GPX has no timestamps; pass --date YYYY-MM-DD'));

  const trimmed = trimEnds(parsed.points, TRIM_RADIUS_METERS);
  if (trimmed.length < 2) {
    fail(
      `nothing publishable: the whole track lies within ${TRIM_RADIUS_METERS} m of its start/end`
    );
  }
  const simplified = simplifyTrack(trimmed);

  const dayDoc: JourneyDayData = {
    date,
    points: simplified,
    pointCount: simplified.length,
    bounds: boundsOf(simplified),
    // Distance from the full-resolution untrimmed track, matching how the
    // sync uses Strava's own full-activity distance.
    distanceMeters: totalDistanceMeters(parsed.points),
    durationSeconds:
      parsed.startMs != null && parsed.endMs != null
        ? Math.max(0, Math.round((parsed.endMs - parsed.startMs) / 1000))
        : 0,
    source: 'gpx',
    stravaActivityId: null,
  };

  admin.initializeApp({ projectId: PROJECT_ID });
  const ref = admin.firestore().collection('journey_days').doc(date);
  const existing = await ref.get();
  await ref.set({
    ...dayDoc,
    createdAt: existing.exists
      ? existing.get('createdAt')
      : admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(
    `journey_days/${date} written: ${dayDoc.pointCount} points, ` +
      `${(dayDoc.distanceMeters / 1000).toFixed(1)} km` +
      (existing.exists ? ' (replaced the previous document)' : '')
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
