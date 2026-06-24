import { buildVisitEntries } from '../shared';
import { computeGeography } from '../geography';
import { days, onsen, onsenMap, visit, visitsMap } from '../__fixtures__/factories';

const OITA = '大分県';
const KUMAMOTO = '熊本県';

const onsens = onsenMap({
  a: onsen({ name: 'A', prefecture: OITA, areaName: 'Beppu', lat: 33.3, lng: 131.5 }),
  b: onsen({ name: 'B', prefecture: OITA, areaName: 'Yufu', lat: 33.2, lng: 131.3 }),
  c: onsen({ name: 'C', prefecture: KUMAMOTO, areaName: 'Aso', lat: 32.9, lng: 131.0 }),
  d: onsen({ name: 'D', prefecture: KUMAMOTO, areaName: 'Aso', lat: 32.8, lng: 130.8 }),
});
const eligible = ['a', 'b', 'c', 'd'];

function geoFor(ids: string[]) {
  const visits = visitsMap(ids.map((id, i) => [id, visit({ visitedAtMs: days(i + 1) })]));
  const entries = buildVisitEntries({ visits, onsenMap: onsens, eligibleOnsenIds: eligible });
  return computeGeography({ entries, onsenMap: onsens, eligibleOnsenIds: eligible });
}

describe('computeGeography', () => {
  it('counts visited vs eligible per prefecture, busiest first', () => {
    const r = geoFor(['a', 'b', 'c']);
    expect(r.byPrefecture).toEqual([
      { key: OITA, visited: 2, eligible: 2 },
      { key: KUMAMOTO, visited: 1, eligible: 2 },
    ]);
  });

  it('reports prefecture coverage as visited / pool span', () => {
    expect(geoFor(['a']).prefecturesCovered).toEqual({ covered: 1, total: 2 });
    expect(geoFor(['a', 'c']).prefecturesCovered).toEqual({ covered: 2, total: 2 });
  });

  it('finds the northern/southern extremes by latitude', () => {
    const r = geoFor(['a', 'b', 'c', 'd']);
    expect(r.northernmost?.onsenId).toBe('a'); // lat 33.3
    expect(r.southernmost?.onsenId).toBe('d'); // lat 32.8
  });

  it('needs ≥ 2 visits for distance and ≥ 2 for most-remote', () => {
    const one = geoFor(['a']);
    expect(one.totalDistanceKm).toBeNull();
    expect(one.mostRemote).toBeNull();

    const many = geoFor(['a', 'b', 'c', 'd']);
    expect(many.totalDistanceKm).not.toBeNull();
    expect(many.totalDistanceKm).toBeGreaterThan(0);
    expect(many.mostRemote).not.toBeNull();
  });
});
