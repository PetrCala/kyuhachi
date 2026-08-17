/**
 * Guards the publishing invariant for /journey_days.
 *
 * buildJourneyDay is the only assembly path for the three writers (the
 * scheduled Strava sync, the publishJourneyDay callable and the manual import
 * script), and the ~500 m trimming it does is the only thing keeping overnight
 * and lodging locations out of a world-readable collection. These tests assert
 * that directly: no stored point may lie within the trim radius of any
 * recording's own start or end, and a track that trims to nothing must publish
 * nothing rather than fall back to the untrimmed points.
 */
import {
  boundsOf,
  buildJourneyDay,
  haversineMeters,
  simplifyTrack,
  totalDistanceMeters,
  trimEnds,
  TRIM_RADIUS_METERS,
  type LatLng,
} from '../track';

const ORIGIN = { lat: 33.0, lng: 130.0 };

/**
 * A 1 Hz walk heading north with a sideways wiggle. The wiggle matters: a
 * perfectly straight track simplifies to its two endpoints, which would make
 * the assertions below vacuous.
 */
function walk(seconds: number, offsetLat = 0): LatLng[] {
  const points: LatLng[] = [];
  for (let i = 0; i < seconds; i++) {
    points.push({
      lat: ORIGIN.lat + offsetLat + i * 1e-5,
      lng: ORIGIN.lng + Math.sin(i / 40) * 2e-4,
    });
  }
  return points;
}

function recording(points: LatLng[], distanceMeters = 1000, durationSeconds = 600) {
  return { points, distanceMeters, durationSeconds };
}

/** The closest any stored point comes to `place`, in meters. */
function closestApproach(stored: LatLng[], place: LatLng): number {
  return Math.min(...stored.map((point) => haversineMeters(place, point)));
}

describe('trimEnds', () => {
  it('drops the leading and trailing runs within the radius', () => {
    const points = walk(2000);
    const trimmed = trimEnds(points, TRIM_RADIUS_METERS);

    expect(trimmed.length).toBeGreaterThan(0);
    expect(trimmed.length).toBeLessThan(points.length);
    expect(closestApproach(trimmed, points[0])).toBeGreaterThanOrEqual(TRIM_RADIUS_METERS);
    expect(closestApproach(trimmed, points[points.length - 1])).toBeGreaterThanOrEqual(
      TRIM_RADIUS_METERS
    );
  });

  it('returns nothing when the whole track lies inside the two zones', () => {
    expect(trimEnds(walk(200), TRIM_RADIUS_METERS)).toEqual([]);
  });

  it('keeps mid-track points that loop back past the start', () => {
    // Out 1.5 km and back to within 100 m of the start: the return leg passes
    // through the start zone but is not part of the leading run, so it stays.
    const out = walk(1400);
    const back = [...out].reverse().slice(0, 1300);
    const trimmed = trimEnds([...out, ...back], TRIM_RADIUS_METERS);

    expect(trimmed.length).toBeGreaterThan(out.length);
  });

  it('handles an empty track', () => {
    expect(trimEnds([], TRIM_RADIUS_METERS)).toEqual([]);
  });
});

describe('buildJourneyDay', () => {
  it('publishes nothing within the trim zones of a single recording', () => {
    const points = walk(5500);
    const built = buildJourneyDay('2026-08-17', [recording(points, 6100, 5500)], 'gpx');

    expect(built).not.toBeNull();
    const stored = built!.data.points;
    expect(stored.length).toBeGreaterThan(50);
    expect(closestApproach(stored, points[0])).toBeGreaterThanOrEqual(TRIM_RADIUS_METERS);
    expect(closestApproach(stored, points[points.length - 1])).toBeGreaterThanOrEqual(
      TRIM_RADIUS_METERS
    );
  });

  it('trims every recording independently, so a mid-day stop is protected too', () => {
    // The afternoon recording starts where the morning one stopped for lunch;
    // trimming the day as a whole would publish that spot.
    const morning = walk(2500);
    const afternoon = walk(2500, 0.03);
    const built = buildJourneyDay(
      '2026-08-19',
      [recording(morning, 2800, 2500), recording(afternoon, 2800, 2500)],
      'gpx'
    );

    expect(built).not.toBeNull();
    const stored = built!.data.points;
    for (const place of [
      morning[0],
      morning[morning.length - 1],
      afternoon[0],
      afternoon[afternoon.length - 1],
    ]) {
      expect(closestApproach(stored, place)).toBeGreaterThanOrEqual(TRIM_RADIUS_METERS);
    }
  });

  it('sums the untrimmed distance and duration it was given', () => {
    const built = buildJourneyDay(
      '2026-08-19',
      [recording(walk(2500), 2800, 2500), recording(walk(2500, 0.03), 2800, 2400)],
      'gpx'
    );

    expect(built!.data.distanceMeters).toBe(5600);
    expect(built!.data.durationSeconds).toBe(4900);
  });

  it('returns null rather than falling back to untrimmed points', () => {
    expect(buildJourneyDay('2026-08-21', [recording(walk(200))], 'gpx')).toBeNull();
    expect(
      buildJourneyDay('2026-08-22', [recording(walk(150)), recording(walk(150, 0.05))], 'gpx')
    ).toBeNull();
  });

  it('keeps a publishable recording and counts the ones that trimmed away', () => {
    const built = buildJourneyDay(
      '2026-08-23',
      [recording(walk(150), 150, 150), recording(walk(5500, 0.05), 6100, 5500)],
      'gpx'
    );

    expect(built!.skippedRecordings).toBe(1);
    expect(built!.data.distanceMeters).toBe(6100);
  });

  it('carries the date, source and activity id onto the document', () => {
    const strava = buildJourneyDay('2026-08-17', [recording(walk(5500))], 'strava', 12345);
    expect(strava!.data.date).toBe('2026-08-17');
    expect(strava!.data.source).toBe('strava');
    expect(strava!.data.stravaActivityId).toBe(12345);

    const manual = buildJourneyDay('2026-08-17', [recording(walk(5500))], 'gpx');
    expect(manual!.data.source).toBe('gpx');
    expect(manual!.data.stravaActivityId).toBeNull();
  });

  it('reports a point count and bounds that match the stored points', () => {
    const built = buildJourneyDay('2026-08-17', [recording(walk(5500))], 'gpx');
    const stored = built!.data.points;

    expect(built!.data.pointCount).toBe(stored.length);
    expect(built!.data.bounds).toEqual(boundsOf(stored));
  });

  it('rounds stored coordinates to six decimals', () => {
    const built = buildJourneyDay('2026-08-17', [recording(walk(5500))], 'gpx');

    for (const { lat, lng } of built!.data.points) {
      expect(lat).toBeCloseTo(Math.round(lat * 1e6) / 1e6, 10);
      expect(lng).toBeCloseTo(Math.round(lng * 1e6) / 1e6, 10);
    }
  });
});

describe('simplifyTrack', () => {
  /**
   * A dense 1 Hz day: a smooth path plus a couple of meters of GPS jitter, which
   * is what defeats naive simplification. 60 000 points is a ~17 hour recording,
   * comfortably longer than any real walking day.
   */
  function denseDay(seconds: number): LatLng[] {
    const points: LatLng[] = [];
    for (let i = 0; i < seconds; i++) {
      points.push({
        lat: ORIGIN.lat + i * 1e-5 + Math.sin(i * 7.3) * 2e-6,
        lng: ORIGIN.lng + Math.sin(i / 40) * 2e-4 + Math.cos(i * 3.1) * 2e-6,
      });
    }
    return points;
  }

  it('keeps the stored point count inside the document budget', () => {
    expect(simplifyTrack(denseDay(60_000)).length).toBeLessThanOrEqual(1500);
  });

  it('keeps enough detail to draw the track', () => {
    expect(simplifyTrack(denseDay(30_000)).length).toBeGreaterThan(500);
  });

  it('stays fast on a full day of 1 Hz points', () => {
    // Guards the sync's 300 s timeout: a real day must simplify in milliseconds,
    // not seconds. Douglas-Peucker degrades badly on adversarial zigzags, so this
    // pins the realistic case rather than assuming it.
    const points = denseDay(30_000);
    const start = Date.now();
    simplifyTrack(points);
    expect(Date.now() - start).toBeLessThan(5_000);
  });

  it('keeps the endpoints of the track it is given', () => {
    const points = walk(2000);
    const simplified = simplifyTrack(points);

    expect(simplified[0].lat).toBeCloseTo(points[0].lat, 5);
    expect(simplified[simplified.length - 1].lat).toBeCloseTo(points[points.length - 1].lat, 5);
  });
});

describe('totalDistanceMeters', () => {
  it('measures a known separation', () => {
    // 0.01 degrees of latitude is ~1.11 km.
    const distance = totalDistanceMeters([ORIGIN, { lat: ORIGIN.lat + 0.01, lng: ORIGIN.lng }]);
    expect(distance).toBeGreaterThan(1100);
    expect(distance).toBeLessThan(1120);
  });

  it('is zero for a track with fewer than two points', () => {
    expect(totalDistanceMeters([])).toBe(0);
    expect(totalDistanceMeters([ORIGIN])).toBe(0);
  });
});
