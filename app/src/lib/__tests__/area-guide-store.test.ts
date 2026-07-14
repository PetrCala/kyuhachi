import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CachedAreaGuides } from '@kyuhachi/shared';
import {
  toCachedAreaGuide,
  sortAreaGuides,
  loadStoredAreaGuides,
  storeAreaGuides,
} from '@/lib/area-guide-store';
import { areaGuideDoc } from '@/lib/__fixtures__/area-guide-doc';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

beforeEach(() => AsyncStorage.clear());

describe('toCachedAreaGuide', () => {
  it('drops the updatedAt Timestamp and folds in the id', () => {
    const cached = toCachedAreaGuide('area-1', areaGuideDoc());
    expect(cached.id).toBe('area-1');
    expect(cached).not.toHaveProperty('updatedAt');
    expect(cached.name).toEqual({ en: 'Beppu', ja: '別府' });
    expect(cached.sections).toHaveLength(2);
  });
});

describe('sortAreaGuides', () => {
  it('orders by areaId and does not mutate the input', () => {
    const input = [
      toCachedAreaGuide('c', areaGuideDoc()),
      toCachedAreaGuide('a', areaGuideDoc()),
      toCachedAreaGuide('b', areaGuideDoc()),
    ];
    const sorted = sortAreaGuides(input);
    expect(sorted.map((g) => g.id)).toEqual(['a', 'b', 'c']);
    expect(input.map((g) => g.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('loadStoredAreaGuides / storeAreaGuides', () => {
  it('round-trips a snapshot', async () => {
    const snapshot: CachedAreaGuides = {
      version: 3,
      fetchedAt: 111,
      guides: [toCachedAreaGuide('a', areaGuideDoc())],
    };
    await storeAreaGuides(snapshot);
    expect(await loadStoredAreaGuides()).toEqual(snapshot);
  });

  it('returns null when nothing is stored', async () => {
    expect(await loadStoredAreaGuides()).toBeNull();
  });

  it('returns null on an unparseable blob', async () => {
    await AsyncStorage.setItem('area_guides.cache.v1', 'not json');
    expect(await loadStoredAreaGuides()).toBeNull();
  });

  it('returns null on a wrong-shaped blob', async () => {
    await AsyncStorage.setItem('area_guides.cache.v1', JSON.stringify({ version: 'x', guides: {} }));
    expect(await loadStoredAreaGuides()).toBeNull();
  });
});
