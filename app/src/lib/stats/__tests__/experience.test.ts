import { buildVisitEntries } from '../shared';
import { computeExperience } from '../experience';
import { days, onsen, onsenMap, visit, visitsMap } from '../__fixtures__/factories';

// A: rich detail (eligible, has onsen info). B: partial. C: rating only, NO onsen
// info (so it counts toward averages but can't be a named superlative).
const visits = visitsMap([
  [
    'A',
    visit({
      visitedAtMs: days(1),
      photoUrls: ['p1', 'p2'],
      data: {
        rating: 8,
        valueRating: 9,
        wouldReturn: true,
        duration: 60,
        saunaUsed: true,
        saunaRating: 7,
        waterTemp: '42°C',
        perceivedHeat: 'hot',
        crowdLevel: 'quiet',
        visitedWith: 'alone',
        interactedWithLocals: true,
        localInteractionRating: 6,
        hadSoap: true,
        massageChairAvailable: false,
      },
    }),
  ],
  [
    'B',
    visit({
      visitedAtMs: days(2),
      data: {
        rating: 6,
        valueRating: 5,
        wouldReturn: false,
        duration: 30,
        saunaUsed: false,
        waterTemp: '40度',
        perceivedHeat: 'pleasant',
        crowdLevel: 'busy',
        visitedWith: 'friend',
        hadSoap: false,
      },
    }),
  ],
  ['C', visit({ visitedAtMs: days(3), data: { rating: 10 } })],
]);
const onsens = onsenMap({ A: onsen({ name: 'A-onsen' }), B: onsen({ name: 'B-onsen' }) });

function experience() {
  const entries = buildVisitEntries({ visits, onsenMap: onsens, eligibleOnsenIds: ['A', 'B', 'C'] });
  return computeExperience(entries);
}

describe('computeExperience', () => {
  const r = experience();

  it('averages overall ratings across all visits but names only loaded onsens', () => {
    expect(r.overall.avg).toBe(8); // (8 + 6 + 10) / 3
    expect(r.overall.coverage).toEqual({ reported: 3, total: 3 });
    // C rates 10 but has no onsen info, so the best *named* pick is A (8).
    expect(r.best).toEqual({ onsenId: 'A', name: 'A-onsen', value: 8 });
  });

  it('summarises sub-ratings with coverage and a named leader', () => {
    const value = r.subRatings.find((s) => s.key === 'value')!;
    expect(value.avg).toBe(7); // (9 + 5) / 2
    expect(value.coverage).toEqual({ reported: 2, total: 3 });
    expect(value.top).toEqual({ onsenId: 'A', name: 'A-onsen', value: 9 });
  });

  it('counts favourites and totals time in the water', () => {
    expect(r.favorites).toEqual({ count: 1, coverage: { reported: 2, total: 3 } });
    expect(r.time.totalMinutes).toBe(90);
    expect(r.time.avgMinutes).toBe(45);
  });

  it('reports facility usage and ratings', () => {
    expect(r.facilities.sauna.usedPercent).toBe(50); // 1 of 2 reported
    expect(r.facilities.sauna.avgRating).toBe(7);
    expect(r.facilities.hadSoapPercent).toBe(50);
  });

  it('builds bath, crowd, and company distributions', () => {
    expect(r.bath.perceivedHeat).toEqual([
      { key: 'tooCool', count: 0 },
      { key: 'pleasant', count: 1 },
      { key: 'hot', count: 1 },
      { key: 'veryHot', count: 0 },
    ]);
    expect(r.bath.avgWaterTempC).toBe(41); // (42 + 40) / 2
    expect(r.crowd.distribution.find((b) => b.key === 'busy')?.count).toBe(1);
    expect(r.company.distribution.find((b) => b.key === 'alone')?.count).toBe(1);
  });

  it('summarises local interaction and media', () => {
    expect(r.locals.interactedPercent).toBe(100); // 1 of 1 reported
    expect(r.locals.avgRating).toBe(6);
    expect(r.media).toEqual({ totalPhotos: 2, visitsWithPhotos: 1 });
  });

  it('collapses to empty for no visits', () => {
    const e = computeExperience([]);
    expect(e.totalVisits).toBe(0);
    expect(e.overall.avg).toBeNull();
    expect(e.best).toBeNull();
    expect(e.time.totalMinutes).toBe(0);
    expect(e.time.avgMinutes).toBeNull();
  });
});
