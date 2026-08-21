import type { JourneyDayDocument } from '@kyuhachi/shared';
import { useMemo } from 'react';
import { formatJstDay } from '../lib/format-date';
import { dayAxis, jstEndOfDayMs, timelineDomain } from '../lib/timeline';
import type { VisitWithOnsenId } from '../types';

interface Props {
  /** Recorded days, oldest first, never filtered by the cutoff. */
  days: JourneyDayDocument[];
  /** All visits, unfiltered; days that gained one get a dot under the rail. */
  visits: Map<string, VisitWithOnsenId>;
  cutoff: string | null;
  playing: boolean;
  onCutoffChange: (day: string | null) => void;
  onTogglePlay: () => void;
  /** Called when the date label is clicked while scrubbed: zoom to that day. */
  onFocusDay?: () => void;
}

const DAY_MS = 86_400_000;

/**
 * The bottom rail the time machine is driven from. The interactive element is
 * still a native range input, kept for its keyboard and screen-reader
 * behaviour, but it is invisible: the track, fill, ticks and thumb under it
 * are drawn by hand so the rail can mark recorded days and visits, which a
 * native slider has no vocabulary for.
 *
 * The slider runs over the calendar axis plus one extra stop on the far
 * right: value === axis.length means live (cutoff null). Scrubbing exactly to
 * the last recorded day is one step left of that and is a distinct, still
 * scrubbed state, so the only way to be live is to land on the final stop.
 */
export function TimelineRail({
  days,
  visits,
  cutoff,
  playing,
  onCutoffChange,
  onTogglePlay,
  onFocusDay,
}: Props) {
  const axis = useMemo(() => {
    const domain = timelineDomain(days);
    return domain ? dayAxis(domain.first, domain.last) : [];
  }, [days]);

  // Where each calendar day sits on the axis, so ticks and the day counter do
  // not pay an indexOf per recorded day on every render.
  const axisIndex = useMemo(() => {
    const map = new Map<string, number>();
    axis.forEach((day, i) => map.set(day, i));
    return map;
  }, [axis]);

  /** Recorded dates ascending, for counting "day N" up to a cutoff. */
  const recordedDates = useMemo(() => days.map((d) => d.date).sort(), [days]);

  const distanceByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of days) map.set(day.date, day.distanceMeters);
    return map;
  }, [days]);

  // How many visits each axis day gained, bucketed by JST end-of-day windows:
  // a visit belongs to day i when it falls after day i-1's last JST instant
  // and at or before day i's. The windows are a fixed 24h apart, so one
  // division places a timestamp instead of a search. Visits outside the axis
  // (none expected) are simply not drawn.
  const visitCounts = useMemo(() => {
    const counts = new Array<number>(axis.length).fill(0);
    if (axis.length === 0) return counts;
    const firstEnd = jstEndOfDayMs(axis[0]);
    for (const visit of visits.values()) {
      const i = Math.ceil((visit.visitedAt.toMillis() - firstEnd) / DAY_MS);
      if (i >= 0 && i < counts.length) counts[i] += 1;
    }
    return counts;
  }, [axis, visits]);

  // A single recorded day has no span to scrub across.
  if (days.length < 2) return null;

  const max = axis.length;
  const value = cutoff == null ? max : Math.max(0, axisIndex.get(cutoff) ?? 0);
  const percent = (v: number) => (v / max) * 100;

  const handleChange = (next: number) => {
    onCutoffChange(next >= max ? null : axis[next]);
  };

  // 1-based position of the viewed day among recorded days: rest days and
  // trimmed-away days do not advance it, so a cutoff on a gap still reads as
  // the last day actually walked.
  const dayN = cutoff == null ? 0 : recordedDates.filter((d) => d <= cutoff).length;

  // The right-hand delta: what the viewed day itself added. A day without a
  // document gets no distance line (a missing day is not a rest day, it may
  // just have been trimmed away, so the rail never asserts anything about it),
  // but a visit made on such a day still counts.
  let delta = '';
  if (cutoff != null) {
    const parts: string[] = [];
    const meters = distanceByDate.get(cutoff);
    if (meters != null) parts.push(`+${(meters / 1000).toFixed(1)} km`);
    const gained = visitCounts[axisIndex.get(cutoff) ?? -1] ?? 0;
    if (gained > 0) parts.push(`+${gained} onsen${gained > 1 ? 's' : ''}`);
    delta = parts.join(' · ');
  }

  return (
    <div className="timeline-rail">
      <button
        type="button"
        className="timeline-play"
        title={playing ? 'Pause the replay' : 'Replay the journey'}
        aria-label={playing ? 'Pause the replay' : 'Replay the journey'}
        onClick={onTogglePlay}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      {/* While scrubbed the label doubles as a shortcut: clicking it zooms
          the map to the day it names. Live has no single day to zoom to, so
          the label stays a plain span there. */}
      {cutoff == null ? (
        <span className="timeline-date">
          <span className="timeline-date-day">Today</span>
        </span>
      ) : (
        <button
          type="button"
          className="timeline-date timeline-date-zoom"
          title="Zoom the map to this day"
          onClick={onFocusDay}
        >
          <span className="timeline-date-day">{formatJstDay(cutoff)}</span>
          <span className="timeline-date-n">day {dayN}</span>
        </button>
      )}
      <div className="timeline-track">
        <div className="timeline-track-bed" aria-hidden="true" />
        <div
          className="timeline-track-fill"
          aria-hidden="true"
          style={{ width: `${percent(value)}%` }}
        />
        {/* One tick per recorded day; the calendar days between them stay
            blank on purpose, for the same reason the delta stays quiet. */}
        {recordedDates.map((d) => (
          <span
            key={d}
            className="timeline-tick"
            aria-hidden="true"
            style={{ left: `${percent(axisIndex.get(d) ?? 0)}%` }}
          />
        ))}
        {visitCounts.map((count, i) =>
          count > 0 ? (
            <span
              key={axis[i]}
              className="timeline-visit-dot"
              aria-hidden="true"
              style={{ left: `${percent(i)}%` }}
            />
          ) : null
        )}
        <input
          type="range"
          className="timeline-range"
          min={0}
          max={max}
          step={1}
          value={value}
          aria-label="Scrub to a day of the walk"
          aria-valuetext={cutoff == null ? 'today, live' : formatJstDay(cutoff)}
          onChange={(event) => handleChange(Number(event.currentTarget.value))}
          onKeyDown={(event) => {
            // Chrome and Firefox jump a range input with Home and End on
            // their own; Safari does not. Doing it here and preventing the
            // default keeps every browser on one behaviour: Home is the
            // first day of the walk, End is back to live.
            if (event.key === 'Home') {
              event.preventDefault();
              onCutoffChange(axis[0]);
            } else if (event.key === 'End') {
              event.preventDefault();
              onCutoffChange(null);
            }
          }}
        />
        {/* Drawn after the input so its focus ring can follow the invisible
            slider's :focus-visible through a sibling selector. */}
        <div className="timeline-thumb" aria-hidden="true" style={{ left: `${percent(value)}%` }} />
      </div>
      {/* Mounted even when live (and empty) so the track does not resize the
          moment scrubbing starts. */}
      <span className="timeline-delta">{delta}</span>
    </div>
  );
}
