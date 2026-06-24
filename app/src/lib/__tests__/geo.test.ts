import { distanceToPolylineKm, haversineKm } from '@/lib/geo';

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
    // Point due north of the segment midpoint (131.05) — far from both the
    // 131.0 and 131.1 vertices, but the segment passes right below it. A
    // vertex-only check would over-report this; the segment check stays small.
    const point = { lat: 33.018, lng: 131.05 }; // ~2 km north of the line
    const toSegment = distanceToPolylineKm(point, ROUTE);
    const toNearestVertex = Math.min(...ROUTE.map((p) => haversineKm(point, p)));
    expect(toSegment).toBeLessThan(toNearestVertex);
    expect(toSegment).toBeCloseTo(2, 0);
  });

  it('clamps to an endpoint for points beyond the route ends', () => {
    // West of the start vertex — closest approach is the start point itself.
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
