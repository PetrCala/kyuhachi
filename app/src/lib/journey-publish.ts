/**
 * Grouping logic for publishing walked days to the public journey site: turn a
 * pile of picked track files into one publishJourneyDay request per JST day.
 *
 * Pure (no React, no native modules, no Firebase): the screen picks and reads
 * the files, this decides which day each recording belongs to, and the callable
 * does the privacy trimming and the write.
 *
 * Days are JST calendar days, matching the /journey_days document id and how the
 * Strava sync groups activities by `start_date_local`.
 */
import type { PublishJourneyDayRequest } from '@kyuhachi/shared';
import type { ParsedTrack } from './route-import';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** A parsed file awaiting grouping. `fileName` is only used to report problems. */
export interface PickedTrack {
  fileName: string;
  track: ParsedTrack;
}

export interface GroupedTracks {
  /** One request per day, days in ascending date order, recordings oldest first. */
  requests: PublishJourneyDayRequest[];
  /**
   * Files that carried no timestamps, so their day is unknowable. Reported to
   * the user rather than guessed at; the import script's --date handles them.
   */
  undated: string[];
}

/** The JST calendar day of an epoch-millis instant, as YYYY-MM-DD. */
export function jstDay(epochMs: number): string {
  return new Date(epochMs + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Group parsed tracks into per-day publish requests.
 *
 * A day walked in two sittings arrives as two files and becomes one request
 * with two recordings, ordered by start time so the concatenated track runs in
 * walk order. Several days arrive as several requests, one call each.
 */
export function groupTracksByDay(picked: PickedTrack[]): GroupedTracks {
  const undated: string[] = [];
  const byDay = new Map<string, PickedTrack[]>();

  for (const entry of picked) {
    if (entry.track.startMs == null) {
      undated.push(entry.fileName);
      continue;
    }
    const day = jstDay(entry.track.startMs);
    const list = byDay.get(day) ?? [];
    list.push(entry);
    byDay.set(day, list);
  }

  const requests = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({
      date,
      recordings: entries
        // Non-null: an entry without startMs went to `undated` above.
        .sort((a, b) => a.track.startMs! - b.track.startMs!)
        .map(({ track }) => ({
          points: track.points,
          distanceMeters: track.distanceMeters,
          durationSeconds: track.durationSeconds,
        })),
    }));

  return { requests, undated };
}
