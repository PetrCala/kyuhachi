import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import {
  buildJourneyDay,
  type JourneyDayRecordingInput,
  type LatLng,
} from '../util/track';

/**
 * Publish one walked day to /journey_days from a track the app parsed on the
 * phone. The path that keeps the public journey site current without the Strava
 * API (see docs/journey-days.md): export the day from the watch's own app, pick
 * the file in Kyuhachi, done, no laptop involved.
 *
 * Firestore rules deny every client write to /journey_days, deliberately and
 * including Petr's own, so this callable is the only client-reachable writer.
 * It runs with admin credentials, which is exactly why it must do its own
 * authorization: the uid check below is the whole gate.
 *
 * PRIVACY: the ~500 m start/end trimming happens here, in buildJourneyDay, not
 * on the device. The client simplifies the track (to keep the upload small over
 * cellular) but never trims, so a client that skipped trimming, or an older app
 * build, cannot publish an untrimmed overnight location.
 *
 * Days written here carry source: "gpx", so the scheduled Strava sync leaves
 * them alone afterwards, the same as the manual import script.
 */

/**
 * The one uid allowed to publish. Canonical copy:
 * shared/src/types/journey.ts (JOURNEY_UID); duplicated because Functions is a
 * separate package from `@kyuhachi/shared`. Keep the two in sync.
 */
const JOURNEY_UID = 'juEfBPJSspS9E2dqMzRac07C1Gs1';

/** Sanity caps on one call. Generous: a real day is one or two recordings. */
const MAX_RECORDINGS = 24;
/**
 * Points accepted across all recordings in one call. The app sends a simplified
 * track (~1500 points per recording), so this leaves room for a raw upload from
 * a script or a future caller without letting one call balloon.
 */
const MAX_POINTS = 50_000;

interface RequestBody {
  date?: unknown;
  recordings?: unknown;
}

export const publishJourneyDay = onCall(async (request) => {
  if (request.auth?.uid !== JOURNEY_UID) {
    throw new HttpsError('permission-denied', 'This account cannot publish journey days.');
  }

  const { date, recordings } = parseRequest(request.data as RequestBody);

  const built = buildJourneyDay(date, recordings, 'gpx');
  if (!built) {
    throw new HttpsError(
      'failed-precondition',
      'Nothing publishable: the track lies entirely within the trimmed start/end zones.'
    );
  }

  const db = getFirestore();
  const ref = db.collection('journey_days').doc(date);
  const existing = await ref.get();
  await ref.set({
    ...built.data,
    createdAt: existing.exists ? existing.get('createdAt') : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info(
    `published ${date}: ${built.data.pointCount} points from ${recordings.length} recording(s)` +
      (built.skippedRecordings > 0 ? `, ${built.skippedRecordings} skipped by trimming` : '') +
      (existing.exists ? ' (replaced)' : '')
  );

  return {
    date,
    pointCount: built.data.pointCount,
    distanceMeters: built.data.distanceMeters,
    replaced: existing.exists,
    skippedRecordings: built.skippedRecordings,
  };
});

/**
 * Validate the request into the shape buildJourneyDay wants. Nothing here
 * trusts the client: non-finite coordinates are dropped rather than stored, and
 * a recording that ends up with fewer than two usable points is rejected
 * outright instead of silently publishing a degenerate line.
 */
function parseRequest(body: RequestBody): { date: string; recordings: JourneyDayRecordingInput[] } {
  const date = body?.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError('invalid-argument', 'date must be a "YYYY-MM-DD" string.');
  }

  const raw = body?.recordings;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpsError('invalid-argument', 'recordings must be a non-empty array.');
  }
  if (raw.length > MAX_RECORDINGS) {
    throw new HttpsError('invalid-argument', `At most ${MAX_RECORDINGS} recordings per call.`);
  }

  let totalPoints = 0;
  const recordings: JourneyDayRecordingInput[] = raw.map((entry, index) => {
    const recording = entry as { points?: unknown; distanceMeters?: unknown; durationSeconds?: unknown };
    if (!Array.isArray(recording?.points)) {
      throw new HttpsError('invalid-argument', `recordings[${index}].points must be an array.`);
    }

    const points: LatLng[] = [];
    for (const point of recording.points) {
      const { lat, lng } = (point ?? {}) as { lat?: unknown; lng?: unknown };
      if (typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng)) {
        points.push({ lat, lng });
      }
    }
    if (points.length < 2) {
      throw new HttpsError(
        'invalid-argument',
        `recordings[${index}] has fewer than two usable points.`
      );
    }

    totalPoints += points.length;
    if (totalPoints > MAX_POINTS) {
      throw new HttpsError('invalid-argument', `At most ${MAX_POINTS} points per call.`);
    }

    return {
      points,
      distanceMeters: nonNegativeNumber(recording.distanceMeters, `recordings[${index}].distanceMeters`),
      durationSeconds: nonNegativeNumber(recording.durationSeconds, `recordings[${index}].durationSeconds`),
    };
  });

  return { date, recordings };
}

function nonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !isFinite(value) || value < 0) {
    throw new HttpsError('invalid-argument', `${field} must be a non-negative number.`);
  }
  return value;
}
