import {
  cumulativeKm,
  distanceToPolylineKm,
  haversineKm,
  pointAtDistanceKm,
  projectOntoPolyline,
} from '@/lib/geo';

type LatLng = { lat: number; lng: number };

// A short straight route running east along a line of latitude near Kyushu.
const ROUTE: LatLng[] = [
  { lat: 33.0, lng: 131.0 },
  { lat: 33.0, lng: 131.1 },
  { lat: 33.0, lng: 131.2 },
];

describe('distanceToPolylineKm', () => {
  it('is ~0 for a point sitting on the route', () => {
    expect(distanceToPolylineKm({ lat: 33.0, lng: 131.05 }, ROUTE)).toBeCloseTo(0, 2);
  });

  it('measures distance to the nearest segment, not just the nearest vertex', () => {
    // Point due north of the segment midpoint (131.05): far from both the
    // 131.0 and 131.1 vertices, but the segment passes right below it. A
    // vertex-only check would over-report this; the segment check stays small.
    const point = { lat: 33.018, lng: 131.05 }; // ~2 km north of the line
    const toSegment = distanceToPolylineKm(point, ROUTE);
    const toNearestVertex = Math.min(...ROUTE.map((p) => haversineKm(point, p)));
    expect(toSegment).toBeLessThan(toNearestVertex);
    expect(toSegment).toBeCloseTo(2, 0);
  });

  it('clamps to an endpoint for points beyond the route ends', () => {
    // West of the start vertex: closest approach is the start point itself.
    const point = { lat: 33.0, lng: 130.9 };
    expect(distanceToPolylineKm(point, ROUTE)).toBeCloseTo(
      haversineKm(point, ROUTE[0]),
      1
    );
  });

  it('falls back to point distance for a single-point route', () => {
    const point = { lat: 33.1, lng: 131.1 };
    expect(distanceToPolylineKm(point, [{ lat: 33.0, lng: 131.0 }])).toBeCloseTo(
      haversineKm(point, { lat: 33.0, lng: 131.0 }),
      5
    );
  });

  it('returns Infinity for an empty route', () => {
    expect(distanceToPolylineKm({ lat: 33.0, lng: 131.0 }, [])).toBe(Infinity);
  });
});

describe('cumulativeKm', () => {
  it('starts at zero and accumulates segment lengths', () => {
    const cum = cumulativeKm(ROUTE);
    expect(cum).toHaveLength(3);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeCloseTo(haversineKm(ROUTE[0], ROUTE[1]), 5);
    expect(cum[2]).toBeCloseTo(
      haversineKm(ROUTE[0], ROUTE[1]) + haversineKm(ROUTE[1], ROUTE[2]),
      5
    );
  });

  it('returns an empty array for an empty line', () => {
    expect(cumulativeKm([])).toEqual([]);
  });
});

describe('projectOntoPolyline', () => {
  const total = haversineKm(ROUTE[0], ROUTE[1]) + haversineKm(ROUTE[1], ROUTE[2]);

  it('reports along-distance and ~0 offset for a point on the route', () => {
    const { alongKm, offsetKm, segmentIndex } = projectOntoPolyline(
      { lat: 33.0, lng: 131.05 },
      ROUTE
    );
    expect(offsetKm).toBeCloseTo(0, 2);
    expect(alongKm).toBeCloseTo(haversineKm(ROUTE[0], { lat: 33.0, lng: 131.05 }), 1);
    expect(segmentIndex).toBe(0);
  });

  it('keeps along-distance while measuring perpendicular offset', () => {
    // ~2 km north of the first segment's midpoint.
    const { alongKm, offsetKm, segmentIndex } = projectOntoPolyline(
      { lat: 33.018, lng: 131.05 },
      ROUTE
    );
    expect(offsetKm).toBeCloseTo(2, 0);
    expect(alongKm).toBeCloseTo(haversineKm(ROUTE[0], { lat: 33.0, lng: 131.05 }), 1);
    expect(segmentIndex).toBe(0);
  });

  it('clamps to the start for points before the route', () => {
    const { alongKm, segmentIndex } = projectOntoPolyline(
      { lat: 33.0, lng: 130.9 },
      ROUTE
    );
    expect(alongKm).toBeCloseTo(0, 5);
    expect(segmentIndex).toBe(0);
  });

  it('clamps to the end for points past the route', () => {
    const { alongKm } = projectOntoPolyline({ lat: 33.0, lng: 131.3 }, ROUTE);
    expect(alongKm).toBeCloseTo(total, 1);
  });

  it('reuses a precomputed cumulative array', () => {
    const cum = cumulativeKm(ROUTE);
    const a = projectOntoPolyline({ lat: 33.0, lng: 131.15 }, ROUTE);
    const b = projectOntoPolyline({ lat: 33.0, lng: 131.15 }, ROUTE, cum);
    expect(b.alongKm).toBeCloseTo(a.alongKm, 6);
    expect(b.segmentIndex).toBe(1);
  });
});

describe('pointAtDistanceKm', () => {
  const total = haversineKm(ROUTE[0], ROUTE[1]) + haversineKm(ROUTE[1], ROUTE[2]);

  it('returns the start at distance 0 and the end at total length', () => {
    expect(pointAtDistanceKm(ROUTE, 0)).toEqual(ROUTE[0]);
    const end = pointAtDistanceKm(ROUTE, total);
    expect(end.lat).toBeCloseTo(ROUTE[2].lat, 6);
    expect(end.lng).toBeCloseTo(ROUTE[2].lng, 6);
  });

  it('interpolates within a segment', () => {
    const mid = pointAtDistanceKm(ROUTE, total / 2);
    expect(mid.lat).toBeCloseTo(33.0, 6);
    expect(mid.lng).toBeCloseTo(131.1, 4); // the middle vertex of the even route
  });

  it('clamps distances beyond the ends', () => {
    expect(pointAtDistanceKm(ROUTE, -5)).toEqual(ROUTE[0]);
    const past = pointAtDistanceKm(ROUTE, total + 5);
    expect(past.lng).toBeCloseTo(ROUTE[2].lng, 6);
  });
});
