import type { Timestamp } from './firestore';

/**
 * The one uid whose journey is published.
 *
 * Mirrored in four places that cannot import this module, so keep all five in
 * sync: `isJourneyUser()` in firebase/firestore.rules, `JOURNEY_UID` in
 * website/src/config.ts (the website is outside the npm workspace), and
 * `JOURNEY_UID` in both functions/src/callables/publishJourneyDay.ts and
 * functions/src/callables/deleteJourneyDay.ts (Functions is a separate package
 * from `@kyuhachi/shared`).
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
   * The ordered, simplified, privacy-trimmed track as a Google-encoded
   * polyline at five decimal places (~1.1 m). Multiple recordings on one day
   * are concatenated in start-time order before encoding.
   *
   * Not an array of {lat, lng}, which is what this was until the walk made the
   * cost obvious: Firestore spends ~24 bytes per point on a map of two doubles
   * and the web SDK wraps each one again in protobuf-JSON, so a single ~1000
   * point day reached the browser as ~95 KB. Every walked day is fetched on
   * every page load, so that was heading for megabytes per visit. The same
   * track encodes to ~2.6 KB, because consecutive points on a walk are metres
   * apart and a delta that small costs two characters.
   *
   * Encoder: `encodePolyline` in functions/src/util/track.ts, the only writer.
   * Decoder: website/src/lib/polyline.ts, the only reader (the app reads this
   * collection for distances and dates, never for the track).
   */
  polyline: string;
  /** Points encoded in `polyline`. Kept as a field so a reader can size a day without decoding. */
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

/**
 * Request for the `deleteJourneyDay` callable: one call removes one day.
 *
 * The undo for a publish that should not have happened. Republishing already
 * covers a day whose track was wrong, but a day that should not exist at all,
 * or one whose mid-walk stop sits outside the trimmed start/end zones and so
 * went out at full fidelity, needs the document gone. Without this the only fix
 * is the console or gcloud, which means a laptop.
 */
export interface DeleteJourneyDayRequest {
  /** JST calendar day, "YYYY-MM-DD". The document id to delete. */
  date: string;
}

export interface DeleteJourneyDayResponse {
  date: string;
  /**
   * False when there was no document for that day. Not an error: the delete is
   * idempotent, and a client acting on a stale list should still see the day
   * gone rather than a failure it cannot act on.
   */
  existed: boolean;
}
