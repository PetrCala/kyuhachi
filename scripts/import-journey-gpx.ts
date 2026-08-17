/**
 * Laptop-side importer for the public journey site: turn exported GPS tracks
 * into /journey_days/{date} documents.
 *
 * The batch path, for catching a week (or a whole backlog) up at once. To
 * publish a single day from the phone, use the in-app screen instead, which
 * calls the publishJourneyDay callable; see docs/journey-days.md.
 *
 * Accepts .gpx, .tcx and .kml, any number of files and directories (searched
 * recursively). Files are grouped into JST days by their own timestamps, so a
 * day walked in two sittings becomes one document with both recordings
 * concatenated in walk order. A COROS Training Hub bulk export unzips into a
 * directory of .tcx files, which this reads directly.
 *
 * Once a day's document carries source: "gpx", the daily Strava sync leaves it
 * alone, so a manual fix is never overwritten the next morning.
 *
 * The exact same privacy trimming applies as everywhere else: buildJourneyDay
 * drops the points within ~500 m of each recording's start and end
 * (functions/src/util/track.ts), so overnight locations never publish.
 *
 * === Running ===
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json \
 *   npm run journey:import-gpx -- /path/to/day.gpx [more files or dirs…] [--date YYYY-MM-DD]
 *
 * The service account key is the same one the seed scripts use:
 * https://console.firebase.google.com/project/kyuhachi-fddcc/settings/serviceaccounts/adminsdk
 * Store it outside the repository.
 *
 * --date files everything given under one day, overriding the file timestamps.
 * It is the escape hatch for a file exported without time data, and only makes
 * sense for a single day's worth of input.
 *
 * --dry-run reports what each day would become and writes nothing, which is
 * worth doing first on a large batch (it needs no credentials).
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import * as admin from 'firebase-admin';
import { DOMParser } from '@xmldom/xmldom';
import { gpx, kml, tcx } from '@tmcw/togeojson';
import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString, Position } from 'geojson';
import {
  buildJourneyDay,
  totalDistanceMeters,
  type JourneyDayRecordingInput,
  type LatLng,
} from '../functions/src/util/track';

const PROJECT_ID = 'kyuhachi-fddcc';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

type TrackFormat = 'gpx' | 'tcx' | 'kml';
const SUPPORTED_EXTENSIONS: TrackFormat[] = ['gpx', 'tcx', 'kml'];

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseArgs(): { inputs: string[]; dateOverride: string | null; dryRun: boolean } {
  const args = process.argv.slice(2);
  const inputs: string[] = [];
  let dateOverride: string | null = null;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date') {
      dateOverride = args[++i] ?? null;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else {
      inputs.push(args[i]);
    }
  }
  if (inputs.length === 0) {
    fail(
      'usage: npm run journey:import-gpx -- <file-or-dir> [more…] [--date YYYY-MM-DD] [--dry-run]\n' +
        `       supported track files: ${SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(', ')}`
    );
  }
  if (dateOverride && !/^\d{4}-\d{2}-\d{2}$/.test(dateOverride)) {
    fail(`--date must be YYYY-MM-DD, got: ${dateOverride}`);
  }
  return { inputs, dateOverride, dryRun };
}

/** Expand files and directories (recursively) into a sorted list of track files. */
function collectTrackFiles(inputs: string[]): string[] {
  const found: string[] = [];

  function walk(path: string, fromDirectory: boolean): void {
    let stats;
    try {
      stats = statSync(path);
    } catch {
      fail(`no such file or directory: ${path}`);
    }
    if (stats.isDirectory()) {
      for (const entry of readdirSync(path)) walk(join(path, entry), true);
      return;
    }
    if (formatOf(path)) {
      found.push(path);
    } else if (!fromDirectory) {
      // An explicitly named file with the wrong extension is a mistake worth
      // reporting; unrelated files inside a directory are simply ignored.
      fail(`unsupported file type: ${path}`);
    }
  }

  for (const input of inputs) walk(input, false);
  return [...new Set(found)].sort();
}

function formatOf(path: string): TrackFormat | null {
  const ext = extname(path).slice(1).toLowerCase();
  return (SUPPORTED_EXTENSIONS as string[]).includes(ext) ? (ext as TrackFormat) : null;
}

interface ParsedFile {
  path: string;
  points: LatLng[];
  /** Epoch millis of the first/last timestamped trackpoints, when present. */
  startMs: number | null;
  endMs: number | null;
}

function toGeoJson(text: string, format: TrackFormat): FeatureCollection<Geometry | null> {
  const doc = new DOMParser().parseFromString(text, 'text/xml') as unknown as Document;
  if (!doc?.documentElement) fail('unreadable track file');
  switch (format) {
    case 'gpx':
      return gpx(doc);
    case 'tcx':
      return tcx(doc);
    case 'kml':
      return kml(doc);
  }
}

function parseTrackFile(path: string): ParsedFile | null {
  const format = formatOf(path);
  if (!format) return null;
  const collection = toGeoJson(readFileSync(path, 'utf8'), format);

  const track = collection.features.find(
    (f: Feature<Geometry | null>): f is Feature<LineString | MultiLineString> =>
      f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'
  );
  if (!track) {
    console.warn(`skipping ${basename(path)}: no track found`);
    return null;
  }

  const positions: Position[] =
    track.geometry.type === 'LineString'
      ? track.geometry.coordinates
      : track.geometry.coordinates.flat();
  const points: LatLng[] = [];
  for (const [lng, lat] of positions) {
    if (Number.isFinite(lat) && Number.isFinite(lng)) points.push({ lat, lng });
  }
  if (points.length < 2) {
    console.warn(`skipping ${basename(path)}: fewer than two usable points`);
    return null;
  }

  // togeojson lifts <time> per point into properties.coordinateProperties.times
  // (nested per segment for MultiLineString).
  const rawTimes: unknown = track.properties?.coordinateProperties?.times;
  const flatTimes: string[] = Array.isArray(rawTimes)
    ? (rawTimes.flat() as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  const startMs = flatTimes.length > 0 ? Date.parse(flatTimes[0]) : NaN;
  const endMs = flatTimes.length > 0 ? Date.parse(flatTimes[flatTimes.length - 1]) : NaN;

  return {
    path,
    points,
    startMs: Number.isFinite(startMs) ? startMs : null,
    endMs: Number.isFinite(endMs) ? endMs : null,
  };
}

/** The JST calendar day of an epoch-millis instant, as YYYY-MM-DD. */
function jstDay(epochMs: number): string {
  return new Date(epochMs + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function toRecording(file: ParsedFile): JourneyDayRecordingInput {
  return {
    points: file.points,
    // Full-resolution, untrimmed, matching how the sync uses Strava's own
    // activity distance.
    distanceMeters: totalDistanceMeters(file.points),
    durationSeconds:
      file.startMs != null && file.endMs != null
        ? Math.max(0, Math.round((file.endMs - file.startMs) / 1000))
        : 0,
  };
}

/**
 * Group parsed files into JST days, each day's recordings in start order.
 *
 * A file with no timestamps has no knowable day, so it is skipped rather than
 * guessed at (and rather than aborting a large batch for the sake of one bad
 * file); --date is how to force one in deliberately.
 */
function groupByDay(files: ParsedFile[], dateOverride: string | null): Map<string, ParsedFile[]> {
  const byDay = new Map<string, ParsedFile[]>();
  for (const file of files) {
    if (dateOverride == null && file.startMs == null) {
      console.warn(
        `skipping ${basename(file.path)}: no timestamps, so its day is unknown ` +
          '(pass --date YYYY-MM-DD to file it explicitly)'
      );
      continue;
    }
    const day = dateOverride ?? jstDay(file.startMs as number);
    const list = byDay.get(day) ?? [];
    list.push(file);
    byDay.set(day, list);
  }
  // Undated files sort last within their day; everything else by start time.
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity));
  }
  return byDay;
}

async function main(): Promise<void> {
  const { inputs, dateOverride, dryRun } = parseArgs();
  const paths = collectTrackFiles(inputs);
  if (paths.length === 0) fail('no .gpx, .tcx or .kml files found in the given paths');

  const files = paths
    .map(parseTrackFile)
    .filter((file): file is ParsedFile => file !== null);
  if (files.length === 0) fail('none of the files held a usable track');

  const byDay = groupByDay(files, dateOverride);
  if (byDay.size === 0) fail('no file had timestamps; pass --date YYYY-MM-DD for a single day');
  if (dateOverride && byDay.size > 1) {
    fail('--date cannot be combined with files spanning more than one day');
  }

  // Nothing is written on a dry run, so it needs no credentials either.
  const db = dryRun ? null : (admin.initializeApp({ projectId: PROJECT_ID }), admin.firestore());

  let written = 0;
  let skipped = 0;
  for (const [date, dayFiles] of [...byDay.entries()].sort()) {
    const built = buildJourneyDay(date, dayFiles.map(toRecording), 'gpx');
    if (!built) {
      console.warn(
        `skipping ${date}: nothing publishable, the whole track lies within the trimmed start/end zones`
      );
      skipped++;
      continue;
    }

    let replaced = false;
    if (db) {
      const ref = db.collection('journey_days').doc(date);
      const existing = await ref.get();
      replaced = existing.exists;
      await ref.set({
        ...built.data,
        createdAt: existing.exists
          ? existing.get('createdAt')
          : admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    written++;

    console.log(
      `journey_days/${date} ${dryRun ? 'would be written' : 'written'}: ` +
        `${built.data.pointCount} points, ` +
        `${(built.data.distanceMeters / 1000).toFixed(1)} km ` +
        `from ${dayFiles.length} recording(s)` +
        (built.skippedRecordings > 0 ? `, ${built.skippedRecordings} trimmed away` : '') +
        (replaced ? ' (replaced the previous document)' : '')
    );
  }

  console.log(
    `done: ${written} day(s) ${dryRun ? 'would be written' : 'written'}` +
      (skipped > 0 ? `, ${skipped} skipped` : '')
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
