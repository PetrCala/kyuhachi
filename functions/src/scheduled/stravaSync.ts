import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  boundsOf,
  simplifyTrack,
  trimEnds,
  TRIM_RADIUS_METERS,
  type JourneyDayData,
  type LatLng,
} from '../util/track';

/**
 * Daily Strava -> /journey_days sync for the public journey website.
 *
 * Runs each JST morning (no webhook, deliberately: publishing is delayed a day
 * anyway, and a rolling window also picks up late edits). Each run:
 *
 *   1. refreshes the access token from the stored refresh token,
 *   2. fetches the athlete's activities of the last SYNC_WINDOW_DAYS days,
 *   3. keeps on-foot activities, groups them by their local (JST) day,
 *   4. pulls each activity's GPS stream, PRIVACY-TRIMS the points within
 *      ~500 m of the recording's start and end (see util/track.ts: the
 *      owner-token API ignores Strava's hidden-zone setting), and
 *   5. upserts one /journey_days/{YYYY-MM-DD} document per day.
 *
 * Days whose existing document came from a manual GPX import (source: "gpx")
 * are left alone: the manual path exists to correct corrupt or missing Strava
 * recordings, so the sync must not undo it the next morning.
 *
 * Secrets (Secret Manager, see docs/strava-sync.md for the one-time setup):
 * STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN. Strava may
 * rotate the refresh token on use; the latest one is persisted in the private
 * /journey_sync/strava document (no Firestore rule matches it, so no client
 * can read it), falling back to the secret for the first run.
 */

const STRAVA_CLIENT_ID = defineSecret('STRAVA_CLIENT_ID');
const STRAVA_CLIENT_SECRET = defineSecret('STRAVA_CLIENT_SECRET');
const STRAVA_REFRESH_TOKEN = defineSecret('STRAVA_REFRESH_TOKEN');

/** How far back each run looks. Covers outages and late activity edits. */
const SYNC_WINDOW_DAYS = 7;

/** Strava sport types that belong on a walking journey's map. */
const FOOT_SPORT_TYPES = new Set(['Walk', 'Hike', 'Run', 'TrailRun']);

const STRAVA_API = 'https://www.strava.com/api/v3';

/** The private sync-state document (rules match nothing here: admin-only). */
const SYNC_STATE_PATH = 'journey_sync/strava';

interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  /** Meters, as measured by Strava for the full activity. */
  distance: number;
  /** Seconds. */
  moving_time: number;
  /** ISO timestamp in UTC. */
  start_date: string;
  /** ISO timestamp in the activity's local timezone (JST on the walk). */
  start_date_local: string;
}

interface StravaLatLngStream {
  latlng?: { data: [number, number][] };
}

export const stravaSync = onSchedule(
  {
    // 07:00 JST every day; the previous day's walk is complete by then.
    schedule: '0 7 * * *',
    timeZone: 'Asia/Tokyo',
    secrets: [STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN],
    timeoutSeconds: 300,
  },
  async () => {
    const db = getFirestore();
    const accessToken = await refreshAccessToken(db);
    const activities = await fetchRecentActivities(accessToken);

    const byDay = new Map<string, StravaActivity[]>();
    for (const activity of activities) {
      if (!FOOT_SPORT_TYPES.has(activity.sport_type)) {
        logger.info(`skipping ${activity.id} (${activity.sport_type}): not on foot`);
        continue;
      }
      const day = activity.start_date_local.slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(activity);
      byDay.set(day, list);
    }

    for (const [day, dayActivities] of [...byDay.entries()].sort()) {
      await syncDay(db, accessToken, day, dayActivities);
    }
    logger.info(`strava sync done: ${byDay.size} day(s) considered`);
  }
);

/**
 * Exchange the stored refresh token for an access token, persisting the
 * refresh token Strava hands back whenever it rotates.
 */
async function refreshAccessToken(db: Firestore): Promise<string> {
  const stateRef = db.doc(SYNC_STATE_PATH);
  const state = await stateRef.get();
  const storedToken = state.exists ? (state.get('refreshToken') as string | undefined) : undefined;
  const refreshToken = storedToken ?? STRAVA_REFRESH_TOKEN.value();

  const res = await fetch(`${STRAVA_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: STRAVA_CLIENT_ID.value(),
      client_secret: STRAVA_CLIENT_SECRET.value(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`strava token refresh failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token: string; refresh_token: string };

  if (body.refresh_token && body.refresh_token !== refreshToken) {
    await stateRef.set({
      refreshToken: body.refresh_token,
      updatedAt: FieldValue.serverTimestamp(),
    });
    logger.info('strava rotated the refresh token; persisted the new one');
  }
  return body.access_token;
}

async function fetchRecentActivities(accessToken: string): Promise<StravaActivity[]> {
  const after = Math.floor(Date.now() / 1000) - SYNC_WINDOW_DAYS * 24 * 60 * 60;
  const res = await fetch(`${STRAVA_API}/athlete/activities?after=${after}&per_page=100`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`strava activities fetch failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as StravaActivity[];
}

async function fetchActivityPoints(accessToken: string, activityId: number): Promise<LatLng[]> {
  const res = await fetch(
    `${STRAVA_API}/activities/${activityId}/streams?keys=latlng&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`strava streams fetch failed for ${activityId}: ${res.status}`);
  }
  const stream = (await res.json()) as StravaLatLngStream;
  const data = stream.latlng?.data ?? [];
  return data
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
    .map(([lat, lng]) => ({ lat, lng }));
}

async function syncDay(
  db: Firestore,
  accessToken: string,
  day: string,
  activities: StravaActivity[]
): Promise<void> {
  const ref = db.collection('journey_days').doc(day);
  const existing = await ref.get();
  if (existing.exists && existing.get('source') === 'gpx') {
    logger.info(`skipping ${day}: manually imported from GPX`);
    return;
  }

  // Oldest first, so a multi-recording day concatenates in walk order.
  activities.sort((a, b) => a.start_date.localeCompare(b.start_date));

  const points: LatLng[] = [];
  let distanceMeters = 0;
  let durationSeconds = 0;
  for (const activity of activities) {
    const raw = await fetchActivityPoints(accessToken, activity.id);
    // Each recording is trimmed independently: every start/stop point is a
    // potential overnight or lodging location.
    const trimmed = trimEnds(raw, TRIM_RADIUS_METERS);
    if (trimmed.length < 2) {
      logger.warn(`activity ${activity.id} on ${day}: no publishable points after trimming`);
      continue;
    }
    points.push(...trimmed);
    distanceMeters += activity.distance;
    durationSeconds += activity.moving_time;
  }

  if (points.length < 2) {
    logger.warn(`skipping ${day}: nothing publishable (GPX fallback: docs/strava-sync.md)`);
    return;
  }

  const simplified = simplifyTrack(points);
  const dayDoc: JourneyDayData = {
    date: day,
    points: simplified,
    pointCount: simplified.length,
    bounds: boundsOf(simplified),
    distanceMeters: Math.round(distanceMeters),
    durationSeconds,
    source: 'strava',
    stravaActivityId: activities[0]?.id ?? null,
  };

  await ref.set({
    ...dayDoc,
    createdAt: existing.exists ? existing.get('createdAt') : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  logger.info(
    `synced ${day}: ${simplified.length} points from ${activities.length} activity(ies)`
  );
}
