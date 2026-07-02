import { buildNextCandidates, selectNearest } from '@/lib/next-onsen';

type Info = {
  name: string;
  nameKana: string | null;
  nameRomaji: string | null;
  areaName: string;
  prefecture: string;
  lat: number;
  lng: number;
};

function info(name: string, lat: number, lng: number): Info {
  return {
    name,
    nameKana: null,
    nameRomaji: name,
    areaName: `${name} area`,
    prefecture: 'Oita',
    lat,
    lng,
  };
}

// A few real-ish Kyushu coordinates so distances are plausible.
const BEPPU = info('Beppu', 33.2846, 131.4914);
const YUFUIN = info('Yufuin', 33.2645, 131.366);
const KUROKAWA = info('Kurokawa', 33.0, 131.15);
const FUKUOKA = info('Fukuoka', 33.5902, 130.4017);

describe('buildNextCandidates', () => {
  const onsenInfo = new Map<string, Info>([
    ['a', BEPPU],
    ['b', YUFUIN],
    ['c', KUROKAWA],
  ]);

  it('keeps only eligible onsens that are unvisited and have loaded info', () => {
    const result = buildNextCandidates(['a', 'b', 'c', 'missing'], new Set(['b']), onsenInfo);
    // 'b' is visited; 'missing' has no info — both dropped.
    expect(result.map((c) => c.id)).toEqual(['a', 'c']);
    expect(result[0]).toMatchObject({ id: 'a', name: 'Beppu', prefecture: 'Oita' });
  });

  it('returns an empty list when everything eligible is visited', () => {
    expect(buildNextCandidates(['a', 'b'], new Set(['a', 'b']), onsenInfo)).toEqual([]);
  });
});

describe('selectNearest', () => {
  const candidates = buildNextCandidates(
    ['a', 'b', 'c', 'd'],
    new Set(),
    new Map<string, Info>([
      ['a', BEPPU],
      ['b', YUFUIN],
      ['c', KUROKAWA],
      ['d', FUKUOKA],
    ])
  );

  it('orders candidates by distance from the origin, nearest first', () => {
    // Standing at Beppu: Yufuin is closest, Fukuoka is farthest.
    const result = selectNearest({ lat: BEPPU.lat, lng: BEPPU.lng }, candidates, 4);
    expect(result.map((r) => r.name)).toEqual(['Beppu', 'Yufuin', 'Kurokawa', 'Fukuoka']);
    expect(result[0].distanceKm).toBeCloseTo(0, 1);
    // Distances must be non-decreasing.
    for (let i = 1; i < result.length; i++) {
      expect(result[i].distanceKm).toBeGreaterThanOrEqual(result[i - 1].distanceKm);
    }
  });

  it('caps the result at the requested count', () => {
    expect(selectNearest({ lat: BEPPU.lat, lng: BEPPU.lng }, candidates, 2)).toHaveLength(2);
  });
});
