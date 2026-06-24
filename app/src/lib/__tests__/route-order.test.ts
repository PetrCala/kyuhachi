import { compareRoutes, routeOrderUpdates, type OrderableRoute } from '../route-order';

describe('compareRoutes', () => {
  const sortIds = (rows: (OrderableRoute & { id: string })[]) =>
    [...rows].sort(compareRoutes).map((r) => r.id);

  it('orders explicitly-ordered routes by sortOrder ascending', () => {
    const rows = [
      { id: 'c', sortOrder: 2, createdAtMillis: 100 },
      { id: 'a', sortOrder: 0, createdAtMillis: 300 },
      { id: 'b', sortOrder: 1, createdAtMillis: 200 },
    ];
    expect(sortIds(rows)).toEqual(['a', 'b', 'c']);
  });

  it('floats unordered (freshly imported) routes above ordered ones', () => {
    const rows = [
      { id: 'ordered', sortOrder: 0, createdAtMillis: 100 },
      { id: 'fresh', createdAtMillis: 50 },
    ];
    expect(sortIds(rows)).toEqual(['fresh', 'ordered']);
  });

  it('orders unordered routes newest first, with a not-yet-synced route at the very top', () => {
    const rows = [
      { id: 'older', createdAtMillis: 100 },
      { id: 'newest', createdAtMillis: 300 },
      { id: 'syncing', createdAtMillis: null }, // null = newest
      { id: 'middle', createdAtMillis: 200 },
    ];
    expect(sortIds(rows)).toEqual(['syncing', 'newest', 'middle', 'older']);
  });

  it('breaks a sortOrder tie by newest first', () => {
    const rows = [
      { id: 'old', sortOrder: 0, createdAtMillis: 100 },
      { id: 'new', sortOrder: 0, createdAtMillis: 200 },
    ];
    expect(sortIds(rows)).toEqual(['new', 'old']);
  });
});

describe('routeOrderUpdates', () => {
  it('returns only the routes whose position changed', () => {
    // a,b,c currently at 0,1,2; user moved c to the top -> c,a,b.
    const current = new Map<string, number | undefined>([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
    expect(routeOrderUpdates(['c', 'a', 'b'], current)).toEqual([
      { id: 'c', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
    ]);
  });

  it('writes nothing when the order is unchanged', () => {
    const current = new Map<string, number | undefined>([
      ['a', 0],
      ['b', 1],
    ]);
    expect(routeOrderUpdates(['a', 'b'], current)).toEqual([]);
  });

  it('assigns a sortOrder to a previously unordered route', () => {
    // b had no sortOrder (fresh import); it stays on top, a moves below it.
    const current = new Map<string, number | undefined>([
      ['b', undefined],
      ['a', 0],
    ]);
    expect(routeOrderUpdates(['b', 'a'], current)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
  });
});
