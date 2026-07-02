import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CachedCatalog } from '@kyuhachi/shared';
import {
  loadStoredCatalog,
  sortCatalog,
  storeCatalog,
  toCachedOnsen,
} from '@/lib/catalog-store';
import { onsenDoc } from '@/lib/__fixtures__/onsen-doc';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

beforeEach(() => AsyncStorage.clear());

describe('toCachedOnsen', () => {
  it('folds in the id and drops the non-serializable Timestamps', () => {
    const cached = toCachedOnsen('abc', onsenDoc({ name: '竹瓦温泉' }));
    expect(cached.id).toBe('abc');
    expect(cached.name).toBe('竹瓦温泉');
    expect(cached).not.toHaveProperty('createdAt');
    expect(cached).not.toHaveProperty('updatedAt');
    // Round-trips through JSON untouched — the property the cache relies on.
    expect(JSON.parse(JSON.stringify(cached))).toEqual(cached);
  });
});

describe('sortCatalog', () => {
  it('orders by areaName, then name, without mutating the input', () => {
    const input = [
      toCachedOnsen('c', onsenDoc({ areaName: '湯布院', name: 'あ' })),
      toCachedOnsen('a', onsenDoc({ areaName: '別府', name: 'い' })),
      toCachedOnsen('b', onsenDoc({ areaName: '別府', name: 'あ' })),
    ];
    const sorted = sortCatalog(input);
    expect(sorted.map((o) => o.id)).toEqual(['b', 'a', 'c']);
    expect(input.map((o) => o.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('loadStoredCatalog / storeCatalog', () => {
  it('round-trips a catalog snapshot', async () => {
    const catalog: CachedCatalog = {
      version: 7,
      fetchedAt: 1234,
      onsens: [toCachedOnsen('a', onsenDoc()), toCachedOnsen('b', onsenDoc({ isActive: false }))],
    };
    await storeCatalog(catalog);
    await expect(loadStoredCatalog()).resolves.toEqual(catalog);
  });

  it('resolves null when nothing is stored', async () => {
    await expect(loadStoredCatalog()).resolves.toBeNull();
  });

  it('treats an unparseable blob as no cache', async () => {
    await AsyncStorage.setItem('catalog.cache.v1', 'not json {');
    await expect(loadStoredCatalog()).resolves.toBeNull();
  });

  it('treats a wrong-shaped blob as no cache', async () => {
    await AsyncStorage.setItem('catalog.cache.v1', JSON.stringify({ some: 'thing' }));
    await expect(loadStoredCatalog()).resolves.toBeNull();
  });
});
