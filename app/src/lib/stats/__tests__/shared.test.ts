import {
  buildVisitEntries,
  coverage,
  distribution,
  eligibleWithOnsen,
  haversineKm,
  mean,
  meanDefined,
  parseWaterTempC,
  percent,
  ratingHistogram,
} from '../shared';
import { days, onsen, onsenMap, visit, visitsMap } from '../__fixtures__/factories';

describe('buildVisitEntries', () => {
  const visits = visitsMap([
    ['b', visit({ visitedAtMs: days(3) })],
    ['a', visit({ visitedAtMs: days(1) })],
    ['z', visit({ visitedAtMs: days(2) })], // not eligible
  ]);
  const onsens = onsenMap({ a: onsen({ name: 'A' }), b: onsen({ name: 'B' }) });

  it('joins onsen info + eligibility and sorts ascending by visit time', () => {
    const entries = buildVisitEntries({ visits, onsenMap: onsens, eligibleOnsenIds: ['a', 'b'] });
    expect(entries.map((e) => e.onsenId)).toEqual(['a', 'z', 'b']);
    expect(entries.map((e) => e.eligible)).toEqual([true, false, true]);
    expect(entries[0].onsen?.name).toBe('A');
    expect(entries[0].visitedAtMs).toBe(days(1));
  });

  it('leaves onsen null when the id is absent from the map', () => {
    const entries = buildVisitEntries({ visits, onsenMap: onsens, eligibleOnsenIds: ['a', 'b', 'z'] });
    const z = entries.find((e) => e.onsenId === 'z');
    expect(z?.onsen).toBeNull();
    expect(z?.eligible).toBe(true);
  });

  it('eligibleWithOnsen keeps only eligible, loaded visits', () => {
    const entries = buildVisitEntries({ visits, onsenMap: onsens, eligibleOnsenIds: ['a', 'b', 'z'] });
    expect(eligibleWithOnsen(entries).map((e) => e.onsenId)).toEqual(['a', 'b']);
  });
});

describe('parseWaterTempC', () => {
  it('extracts the leading number from common temperature strings', () => {
    expect(parseWaterTempC('42°C')).toBe(42);
    expect(parseWaterTempC('41.5 ℃')).toBe(41.5);
    expect(parseWaterTempC('42度')).toBe(42);
    expect(parseWaterTempC('  38 ')).toBe(38);
  });

  it('returns null for non-numeric, empty, or out-of-range values', () => {
    expect(parseWaterTempC(null)).toBeNull();
    expect(parseWaterTempC('')).toBeNull();
    expect(parseWaterTempC('warm')).toBeNull();
    expect(parseWaterTempC('150')).toBeNull(); // implausible
    expect(parseWaterTempC('-5')).toBeNull();
  });
});

describe('haversineKm', () => {
  it('is zero for the same point and ~111km per degree of latitude', () => {
    const a = { lat: 33, lng: 131 };
    expect(haversineKm(a, a)).toBe(0);
    expect(haversineKm(a, { lat: 34, lng: 131 })).toBeCloseTo(111.2, 0);
  });
});

describe('numeric helpers', () => {
  it('mean is null for an empty set', () => {
    expect(mean([])).toBeNull();
    expect(mean([2, 4])).toBe(3);
  });

  it('meanDefined drops nulls and is null when all-null', () => {
    expect(meanDefined([1, null, 3])).toBe(2);
    expect(meanDefined([null, null])).toBeNull();
  });

  it('percent is null when total is zero', () => {
    expect(percent(2, 0)).toBeNull();
    expect(percent(1, 4)).toBe(25);
  });
});

describe('distribution & histogram', () => {
  it('counts in canonical order, drops nulls, keeps zero buckets', () => {
    expect(distribution(['x', 'x', null, 'z'], ['x', 'y', 'z'] as const)).toEqual([
      { key: 'x', count: 2 },
      { key: 'y', count: 0 },
      { key: 'z', count: 1 },
    ]);
  });

  it('ratingHistogram is zero-filled 1–10, rounds, drops out-of-range', () => {
    const h = ratingHistogram([1, 1, 5.4, 10, null, 11, 0]);
    expect(h).toHaveLength(10);
    expect(h[0]).toEqual({ bucket: 1, count: 2 });
    expect(h[4]).toEqual({ bucket: 5, count: 1 }); // 5.4 → 5
    expect(h[9]).toEqual({ bucket: 10, count: 1 });
  });

  it('coverage reports reported / total', () => {
    expect(coverage([1, null, 3, null])).toEqual({ reported: 2, total: 4 });
  });
});
