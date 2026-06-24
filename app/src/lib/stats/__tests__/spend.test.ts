import { buildVisitEntries } from '../shared';
import { computeSpendHighlights } from '../spend';
import { days, onsen, onsenMap, visit, visitsMap } from '../__fixtures__/factories';

const onsens = onsenMap({
  a: onsen({ name: 'A', adultFee: 500 }),
  b: onsen({ name: 'B', adultFee: 1200 }),
  c: onsen({ name: 'C', adultFee: 300 }),
  d: onsen({ name: 'D', adultFee: 2000 }), // unvisited
  e: onsen({ name: 'E', adultFee: null }), // unpriced
});
const eligible = ['a', 'b', 'c', 'd', 'e'];

describe('computeSpendHighlights', () => {
  const visits = visitsMap([
    ['a', visit({ visitedAtMs: days(1), data: { valueRating: 9 } })],
    ['b', visit({ visitedAtMs: days(2), data: { valueRating: 4 } })],
    ['c', visit({ visitedAtMs: days(3), data: { valueRating: 9 } })],
  ]);
  const entries = buildVisitEntries({ visits, onsenMap: onsens, eligibleOnsenIds: eligible });
  const r = computeSpendHighlights({ entries, onsenMap: onsens, eligibleOnsenIds: eligible });

  it('finds the cheapest and dearest visited onsens', () => {
    expect(r.cheapestVisited).toEqual({ onsenId: 'c', name: 'C', fee: 300 });
    expect(r.dearestVisited).toEqual({ onsenId: 'b', name: 'B', fee: 1200 });
  });

  it('finds the most expensive onsen still to visit (priced only)', () => {
    expect(r.dearestRemaining).toEqual({ onsenId: 'd', name: 'D', fee: 2000 });
  });

  it('ranks value leaders by rating then cheaper fee', () => {
    expect(r.valueLeaders).toEqual([
      { onsenId: 'c', name: 'C', fee: 300, rating: 9 }, // tie at 9 → cheaper first
      { onsenId: 'a', name: 'A', fee: 500, rating: 9 },
      { onsenId: 'b', name: 'B', fee: 1200, rating: 4 },
    ]);
  });

  it('is all-null when nothing priced has been visited', () => {
    const empty = computeSpendHighlights({
      entries: buildVisitEntries({ visits: visitsMap([]), onsenMap: onsens, eligibleOnsenIds: eligible }),
      onsenMap: onsens,
      eligibleOnsenIds: eligible,
    });
    expect(empty.cheapestVisited).toBeNull();
    expect(empty.dearestVisited).toBeNull();
    expect(empty.valueLeaders).toEqual([]);
    expect(empty.dearestRemaining).toEqual({ onsenId: 'd', name: 'D', fee: 2000 });
  });
});
