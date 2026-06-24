import { buildVisitEntries } from '../shared';
import { computeTransport } from '../transport';
import { days, onsen, onsenMap, visit, visitsMap } from '../__fixtures__/factories';
import type { TransportMode } from '@kyuhachi/shared';

const OITA = '大分県';
const KUMAMOTO = '熊本県';

const onsens = onsenMap({
  a: onsen({ prefecture: OITA }),
  b: onsen({ prefecture: OITA }),
  c: onsen({ prefecture: KUMAMOTO }),
  d: onsen({ prefecture: KUMAMOTO }),
});
const eligible = ['a', 'b', 'c', 'd'];

/** Build a transport result from `[id, mode]` pairs (mode null = unreported). */
function transportFor(rows: [string, TransportMode | null][], baseMode: TransportMode | null) {
  const visits = visitsMap(
    rows.map(([id, mode], i) => [id, visit({ visitedAtMs: days(i + 1), data: { transportMode: mode } })])
  );
  const entries = buildVisitEntries({ visits, onsenMap: onsens, eligibleOnsenIds: eligible });
  return computeTransport({ entries, baseMode });
}

describe('computeTransport', () => {
  it('builds the mode mix with an unreported bucket and zero buckets kept', () => {
    const r = transportFor(
      [
        ['a', 'foot'],
        ['b', 'foot'],
        ['c', 'car'],
        ['d', null],
      ],
      'foot'
    );
    expect(r.mix).toEqual([
      { key: 'foot', count: 2 },
      { key: 'bicycle', count: 0 },
      { key: 'public', count: 0 },
      { key: 'car', count: 1 },
      { key: 'unreported', count: 1 },
    ]);
    expect(r.totalCount).toBe(4);
    expect(r.reportedCount).toBe(3);
  });

  it('computes the self-powered share over reported visits', () => {
    const r = transportFor(
      [
        ['a', 'foot'],
        ['b', 'bicycle'],
        ['c', 'car'],
        ['d', null],
      ],
      'foot'
    );
    // (foot + bicycle) / 3 reported = 66.6…%
    expect(r.selfPoweredPercent).toBeCloseTo(66.667, 2);
  });

  it('counts shortcuts faster than baseMode (and reflects whether one exists)', () => {
    const rows: [string, TransportMode | null][] = [
      ['a', 'foot'],
      ['b', 'public'],
      ['c', 'car'],
      ['d', null],
    ];
    expect(transportFor(rows, 'foot').shortcutCount).toBe(2); // public + car beat foot
    const carBase = transportFor(rows, 'car');
    expect(carBase.shortcutCount).toBe(0); // nothing beats car
    expect(carBase.hasBaseMode).toBe(true);
    expect(transportFor(rows, null).hasBaseMode).toBe(false);
  });

  it('splits the mix per prefecture, busiest first', () => {
    const r = transportFor(
      [
        ['a', 'foot'],
        ['b', 'car'],
        ['c', 'foot'],
      ],
      'foot'
    );
    expect(r.byPrefecture.map((row) => [row.prefecture, row.total])).toEqual([
      [OITA, 2],
      [KUMAMOTO, 1],
    ]);
  });

  it('has no self-powered share when nothing is reported', () => {
    const r = transportFor([['a', null]], 'foot');
    expect(r.selfPoweredPercent).toBeNull();
  });
});
