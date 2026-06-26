import type { Poi } from '@kyuhachi/shared';
import {
  corridorTileCenters,
  orderAlongRoute,
  orderNearMe,
  userAlongRouteKm,
} from '@/lib/finder';
import { haversineKm } from '@/lib/geo';

type LatLng = { lat: number; lng: number };

// Straight east-bound route near Kyushu; each segment ~9.3 km.
const ROUTE: LatLng[] = [
  { lat: 33.0, lng: 131.0 },
  { lat: 33.0, lng: 131.1 },
  { lat: 33.0, lng: 131.2 },
];
const TOTAL = haversineKm(ROUTE[0], ROUTE[1]) + haversineKm(ROUTE[1], ROUTE[2]);

function poi(name: string, lat: number, lng: number): Poi {
  return { name, lat, lng, category: 'convenience_store' };
}

// On-route POIs at increasing longitude, one behind, one off-corridor.
const NEAR = poi('near', 33.0, 131.05); // ~4.7 km along
const FAR = poi('far', 33.0, 131.15); // ~14 km along
const BEHIND = poi('behind', 33.0, 130.95); // before the start
const OFFROUTE = poi('offroute', 33.1, 131.05); // ~11 km north of the line

describe('orderAlongRoute', () => {
  const user = { lat: 33.0, lng: 131.0 }; // at the route start

  it('keeps ahead, in-corridor POIs ordered by encounter', () => {
    const out = orderAlongRoute({
      user,
      route: ROUTE,
      pois: [FAR, OFFROUTE, NEAR, BEHIND],
      corridorKm: 1,
      lookAheadKm: 20,
    });
    expect(out.map((r) => r.poi.name)).toEqual(['near', 'far']);
    expect(out[0].aheadKm).toBeLessThan(out[1].aheadKm!);
    expect(out[0].detourKm).toBeCloseTo(0, 1);
  });

  it('drops POIs beyond the look-ahead window', () => {
    const out = orderAlongRoute({
      user,
      route: ROUTE,
      pois: [NEAR, FAR],
      corridorKm: 1,
      lookAheadKm: 10,
    });
    expect(out.map((r) => r.poi.name)).toEqual(['near']);
  });

  it('drops POIs outside the corridor', () => {
    const out = orderAlongRoute({
      user,
      route: ROUTE,
      pois: [OFFROUTE],
      corridorKm: 1,
      lookAheadKm: 20,
    });
    expect(out).toHaveLength(0);
  });

  it('reverses encounter order when travelling the other way', () => {
    const out = orderAlongRoute({
      user: { lat: 33.0, lng: 131.2 }, // at the route end
      route: ROUTE,
      pois: [NEAR, FAR],
      corridorKm: 1,
      lookAheadKm: 20,
      reversed: true,
    });
    expect(out.map((r) => r.poi.name)).toEqual(['far', 'near']);
  });
});

describe('orderNearMe', () => {
  it('keeps POIs within radius, sorted by straight-line distance', () => {
    const out = orderNearMe({
      user: { lat: 33.0, lng: 131.0 },
      pois: [FAR, NEAR, OFFROUTE],
      radiusKm: 8,
    });
    expect(out.map((r) => r.poi.name)).toEqual(['near']);
    expect(out[0].awayKm).toBeGreaterThan(0);
  });
});

describe('userAlongRouteKm', () => {
  it('is ~0 at the start and ~total at the end', () => {
    expect(userAlongRouteKm({ lat: 33.0, lng: 131.0 }, ROUTE)).toBeCloseTo(0, 1);
    expect(userAlongRouteKm({ lat: 33.0, lng: 131.2 }, ROUTE)).toBeCloseTo(TOTAL, 1);
  });

  it('reverses to ~total at the start when travelling backward', () => {
    expect(userAlongRouteKm({ lat: 33.0, lng: 131.0 }, ROUTE, true)).toBeCloseTo(TOTAL, 1);
  });
});

describe('corridorTileCenters', () => {
  it('lays bounded, on-route centres across the look-ahead span', () => {
    const { centers, radiusKm } = corridorTileCenters({
      route: ROUTE,
      userAlongKm: 0,
      lookAheadKm: 20,
      corridorKm: 1,
    });
    expect(centers.length).toBeGreaterThanOrEqual(1);
    expect(centers.length).toBeLessThanOrEqual(6);
    // Centres sit on the (constant-latitude) route and march eastward.
    for (const c of centers) expect(c.lat).toBeCloseTo(33.0, 6);
    for (let i = 1; i < centers.length; i++) {
      expect(centers[i].lng).toBeGreaterThan(centers[i - 1].lng);
    }
    expect(radiusKm).toBeGreaterThan(1); // covers half a tile gap plus the corridor
    expect(radiusKm).toBeLessThanOrEqual(50);
  });

  it('marches the other way when reversed', () => {
    const { centers } = corridorTileCenters({
      route: ROUTE,
      userAlongKm: 0, // travel-direction along; reversed maps it to the route end
      lookAheadKm: 20,
      corridorKm: 1,
      reversed: true,
    });
    for (let i = 1; i < centers.length; i++) {
      expect(centers[i].lng).toBeLessThan(centers[i - 1].lng);
    }
  });

  it('returns nothing for a degenerate route', () => {
    expect(
      corridorTileCenters({ route: [ROUTE[0]], userAlongKm: 0, lookAheadKm: 20, corridorKm: 1 })
        .centers
    ).toHaveLength(0);
  });
});
