import { computeBudget, formatYen, UNREPORTED_TRANSPORT, type BudgetOnsenInfo } from '@/lib/budget';
import type { TransportMode } from '@kyuhachi/shared';

function onsens(
  entries: Record<string, BudgetOnsenInfo>
): Map<string, BudgetOnsenInfo> {
  return new Map(Object.entries(entries));
}

function transport(
  entries: Record<string, TransportMode | null>
): Map<string, TransportMode | null> {
  return new Map(Object.entries(entries));
}

describe('computeBudget', () => {
  // Eligible pool of 5; the user has visited 4 onsens — one of which ('z') is
  // NOT eligible (it must be ignored) and one eligible visit ('d') has no fee.
  const base = {
    eligibleOnsenIds: ['a', 'b', 'c', 'd', 'e'],
    completionCount: 4,
    onsenInfo: onsens({
      a: { prefecture: 'Oita', adultFee: 500 },
      b: { prefecture: 'Oita', adultFee: 300 },
      c: { prefecture: 'Kumamoto', adultFee: 200 },
      d: { prefecture: 'Kumamoto', adultFee: null },
      e: { prefecture: 'Fukuoka', adultFee: 1000 },
    }),
    visitedOnsenIds: new Set(['a', 'b', 'd', 'z']),
    transportByOnsen: transport({ a: 'foot', b: 'car', d: 'public', z: 'foot' }),
  };

  it('sums fees only over unique eligible, priced visits', () => {
    const r = computeBudget(base);
    expect(r.eligibleVisitedCount).toBe(3); // a, b, d — 'z' is not eligible
    expect(r.pricedVisitedCount).toBe(2); // d has a null fee
    expect(r.spentSoFar).toBe(800); // 500 + 300
    expect(r.avgPerVisit).toBe(400); // 800 / 2 priced
  });

  it('projects the cheapest path to finish over eligible-unvisited fees', () => {
    const r = computeBudget(base);
    expect(r.remaining).toBe(1); // 4 target − 3 eligible visited
    // Unvisited eligible priced fees are c=200, e=1000; cheapest 1 → 200.
    expect(r.projectedRemaining).toBe(200);
    expect(r.projectedPricedCount).toBe(1);
    expect(r.projectedTotal).toBe(1000); // 800 spent + 200 projected
  });

  it('groups spend by prefecture, richest first, priced visits only', () => {
    const r = computeBudget(base);
    // Only a + b (both Oita) are priced eligible visits; Kumamoto's visit (d)
    // is unpriced, so the group is omitted entirely.
    expect(r.byPrefecture).toEqual([{ key: 'Oita', total: 800, count: 2 }]);
  });

  it('groups spend by transport in canonical order', () => {
    const r = computeBudget(base);
    expect(r.byTransport).toEqual([
      { key: 'foot', total: 500, count: 1 },
      { key: 'car', total: 300, count: 1 },
    ]);
  });

  it('buckets visits with no reported transport as "unreported"', () => {
    const r = computeBudget({
      ...base,
      // b has a fee but no transport entry → unreported.
      transportByOnsen: transport({ a: 'foot' }),
    });
    expect(r.byTransport).toEqual([
      { key: 'foot', total: 500, count: 1 },
      { key: UNREPORTED_TRANSPORT, total: 300, count: 1 },
    ]);
  });

  it('clamps remaining at zero and prices what it can when short on data', () => {
    const r = computeBudget({
      ...base,
      completionCount: 2, // already exceeded by 3 eligible visits
    });
    expect(r.remaining).toBe(0);
    expect(r.projectedRemaining).toBe(0);
    expect(r.projectedTotal).toBe(r.spentSoFar);
  });

  it('returns zeros for an untouched challenge', () => {
    const r = computeBudget({
      eligibleOnsenIds: ['a', 'b'],
      completionCount: 2,
      onsenInfo: onsens({ a: { prefecture: 'Oita', adultFee: 400 }, b: { prefecture: 'Oita', adultFee: 600 } }),
      visitedOnsenIds: new Set<string>(),
      transportByOnsen: transport({}),
    });
    expect(r.spentSoFar).toBe(0);
    expect(r.avgPerVisit).toBe(0);
    expect(r.remaining).toBe(2);
    expect(r.projectedRemaining).toBe(1000); // both eligible fees, cheapest 2
    expect(r.byPrefecture).toEqual([]);
    expect(r.byTransport).toEqual([]);
  });
});

describe('formatYen', () => {
  it('formats integer yen with thousands separators', () => {
    expect(formatYen(0)).toBe('¥0');
    expect(formatYen(800)).toBe('¥800');
    expect(formatYen(1234)).toBe('¥1,234');
    expect(formatYen(1000000)).toBe('¥1,000,000');
  });

  it('rounds non-integer means', () => {
    expect(formatYen(633.4)).toBe('¥633');
    expect(formatYen(633.5)).toBe('¥634');
  });
});
