import type { Timestamp } from './firestore';

/**
 * The one uid whose journey is published.
 *
 * Mirrored in three places that cannot import this module, so keep all four in
 * sync: `isJourneyUser()` in firebase/firestore.rules, `JOURNEY_UID` in
 * website/src/config.ts (the website is outside the npm workspace), and
 * `JOURNEY_UID` in functions/src/callables/publishJourneyDay.ts (Functions is a
 * separate package from `@kyuhachi/shared`).
 */
export const JOURNEY_UID = 'juEfBPJSspS9E2dqMzRac07C1Gs1';

/**
 * /journey_days/{date}
 *
 * One document per day Petr actually walked, keyed by the day itself
 * (YYYY-MM-DD in JST), so a day is structurally deduplicated and re-syncing
 * is an upsert. The public journey website renders these as the walked route,
 * one polyline per day; days with no document render as gaps.
 *
 * Written exclusively with admin credentials (the scheduled Strava sync
 * Function, or the manual GPX import fallback), which bypass Firestore rules;
 * every client write is denied. Reads are public.
 *
 * Privacy invariant: `points` is trimmed before publishing so that points
 * within ~500 m of the day's start and end never appear. Strava's own
 * hidden-zone setting only redacts what OTHER Strava users see; the
 * owner-token API returns the full track, so the sync must do its own
 * trimming or overnight locations would go public.
 */
export interface JourneyDayDocument {
  /** The walked day in JST, "YYYY-MM-DD". Mirrors the document id. */
  date: string;
  /**
   * Ordered, simplified, privacy-trimmed track points (same shape as
   * RouteDocument.points). Multiple recordings on one day are concatenated in
   * start-time order.
   */
  points: { lat: number; lng: number }[];
  pointCount: number;
  /** Bounding box of the trimmed track, for map fitting. */
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  /** Distance of the full recorded day (untrimmed), meters. */
  distanceMeters: number;
  /** Moving time of the full recorded day, seconds. */
  durationSeconds: number;
  /** Where the track came from: the Strava sync or a manual GPX import. */
  source: 'strava' | 'gpx';
  /**
   * Id of the (first) Strava activity this day was built from, for
   * re-sync traceability. Null for GPX imports.
   */
  stravaActivityId: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * One continuous recording (one exported track file) contributing to a day.
 * A day walked in two sittings is two recordings, concatenated in start order.
 *
 * `points` are already simplified on the device, purely to keep the upload
 * small enough to send over cellular from the road: a raw 1 Hz day is well over
 * a megabyte, the simplified track is tens of kilobytes, and Douglas-Peucker at
 * ~1 m tolerance moves no point far enough to matter to the 500 m privacy trim.
 * The trimming itself stays server-side, where the client cannot skip it.
 */
export interface JourneyDayRecording {
  /** Simplified track points in recording order. */
  points: { lat: number; lng: number }[];
  /**
   * Distance of this recording measured on the device at full resolution,
   * before simplifying or trimming, meters. Matches how the Strava sync uses
   * Strava's own activity distance rather than remeasuring the stored track.
   */
  distanceMeters: number;
  /** Duration of this recording, seconds. */
  durationSeconds: number;
}

/**
 * Request for the `publishJourneyDay` callable: one call publishes one day.
 * The client derives the JST day from the file's timestamps and groups its
 * picked files accordingly, mirroring how the Strava sync groups activities.
 */
export interface PublishJourneyDayRequest {
  /** JST calendar day, "YYYY-MM-DD". Becomes the document id. */
  date: string;
  /** That day's recordings, oldest first. */
  recordings: JourneyDayRecording[];
}

export interface PublishJourneyDayResponse {
  date: string;
  /** Points actually stored, after trimming and simplifying. */
  pointCount: number;
  distanceMeters: number;
  /** True when the write replaced an existing document for that day. */
  replaced: boolean;
  /** Recordings dropped because privacy trimming left nothing publishable. */
  skippedRecordings: number;
}
