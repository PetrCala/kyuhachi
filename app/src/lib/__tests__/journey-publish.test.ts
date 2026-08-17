import { groupTracksByDay, jstDay, type PickedTrack } from '../journey-publish';
import type { ParsedTrack } from '../route-import';

function track(startIso: string | null, overrides: Partial<ParsedTrack> = {}): ParsedTrack {
  const startMs = startIso == null ? null : Date.parse(startIso);
  return {
    points: [
      { lat: 33.1, lng: 130.1 },
      { lat: 33.2, lng: 130.2 },
    ],
    distanceMeters: 1000,
    durationSeconds: 600,
    startMs,
    endMs: startMs == null ? null : startMs + 600_000,
    ...overrides,
  };
}

function picked(fileName: string, startIso: string | null): PickedTrack {
  return { fileName, track: track(startIso) };
}

describe('jstDay', () => {
  it('uses the JST calendar day, not UTC', () => {
    // 22:00 UTC is already the next day in JST (+9).
    expect(jstDay(Date.parse('2026-08-16T22:00:00Z'))).toBe('2026-08-17');
    expect(jstDay(Date.parse('2026-08-17T05:00:00Z'))).toBe('2026-08-17');
  });

  it('puts an early-morning JST start on the day it starts, not the day before', () => {
    // 15:00 UTC = midnight JST: the first instant of the next JST day.
    expect(jstDay(Date.parse('2026-08-16T15:00:00Z'))).toBe('2026-08-17');
    // One millisecond earlier is still the previous JST day.
    expect(jstDay(Date.parse('2026-08-16T14:59:59.999Z'))).toBe('2026-08-16');
  });
});

describe('groupTracksByDay', () => {
  it('makes one request per day, in ascending date order', () => {
    const { requests, undated } = groupTracksByDay([
      picked('day2.gpx', '2026-08-18T01:00:00Z'),
      picked('day1.gpx', '2026-08-17T01:00:00Z'),
    ]);

    expect(undated).toEqual([]);
    expect(requests.map((r) => r.date)).toEqual(['2026-08-17', '2026-08-18']);
    expect(requests.every((r) => r.recordings.length === 1)).toBe(true);
  });

  it('merges a day walked in two sittings into one request, oldest recording first', () => {
    const morning = picked('morning.gpx', '2026-08-17T00:00:00Z');
    const afternoon = picked('afternoon.gpx', '2026-08-17T05:00:00Z');

    // Picked in the wrong order on purpose: the walk order is what matters.
    const { requests } = groupTracksByDay([afternoon, morning]);

    expect(requests).toHaveLength(1);
    expect(requests[0].date).toBe('2026-08-17');
    expect(requests[0].recordings).toHaveLength(2);
    expect(requests[0].recordings[0].durationSeconds).toBe(morning.track.durationSeconds);
  });

  it('groups by JST day, so a late-evening JST recording does not slide to the previous day', () => {
    // 13:00 UTC = 22:00 JST on the 17th.
    const { requests } = groupTracksByDay([picked('evening.gpx', '2026-08-17T13:00:00Z')]);
    expect(requests.map((r) => r.date)).toEqual(['2026-08-17']);
  });

  it('reports files with no timestamps instead of guessing a day', () => {
    const { requests, undated } = groupTracksByDay([
      picked('timeless.gpx', null),
      picked('dated.gpx', '2026-08-17T01:00:00Z'),
    ]);

    expect(undated).toEqual(['timeless.gpx']);
    expect(requests.map((r) => r.date)).toEqual(['2026-08-17']);
  });

  it('carries the parsed geometry and full-resolution distance through unchanged', () => {
    const entry: PickedTrack = {
      fileName: 'day.gpx',
      track: track('2026-08-17T01:00:00Z', {
        points: [
          { lat: 33.5, lng: 130.5 },
          { lat: 33.6, lng: 130.6 },
          { lat: 33.7, lng: 130.7 },
        ],
        distanceMeters: 31_400,
      }),
    };

    const { requests } = groupTracksByDay([entry]);

    expect(requests[0].recordings[0].points).toEqual(entry.track.points);
    expect(requests[0].recordings[0].distanceMeters).toBe(31_400);
  });

  it('returns nothing to publish for an empty pick', () => {
    expect(groupTracksByDay([])).toEqual({ requests: [], undated: [] });
  });
});
