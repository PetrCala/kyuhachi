import type { Timestamp } from './firestore';

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
