import type { CachedAreaGuide } from '@kyuhachi/shared';
import { pickLocalized, nearestAreaGuide, sortAreaGuidesByName } from '@/lib/area-guide';
import { toCachedAreaGuide } from '@/lib/area-guide-store';
import { areaGuideDoc } from '@/lib/__fixtures__/area-guide-doc';

// area-guide-store (imported for toCachedAreaGuide) pulls in AsyncStorage at
// module load; stub the native module so the import doesn't throw under jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('pickLocalized', () => {
  const text = { en: 'Beppu', ja: '別府' };

  it('returns Japanese for any ja* locale', () => {
    expect(pickLocalized(text, 'ja')).toBe('別府');
    expect(pickLocalized(text, 'ja-JP')).toBe('別府');
  });

  it('returns English for everything else', () => {
    expect(pickLocalized(text, 'en')).toBe('Beppu');
    expect(pickLocalized(text, 'en-US')).toBe('Beppu');
    expect(pickLocalized(text, 'fr')).toBe('Beppu');
  });
});

describe('nearestAreaGuide', () => {
  const beppu = toCachedAreaGuide('beppu', areaGuideDoc({ center: { lat: 33.28, lng: 131.5 } }));
  const kagoshima = toCachedAreaGuide(
    'kagoshima',
    areaGuideDoc({ center: { lat: 31.6, lng: 130.55 } })
  );
  const guides: CachedAreaGuide[] = [beppu, kagoshima];

  it('picks the region whose centre is closest', () => {
    // A point just north of Beppu resolves to Beppu, not far-south Kagoshima.
    expect(nearestAreaGuide({ lat: 33.3, lng: 131.49 }, guides)?.id).toBe('beppu');
    // A point near Kagoshima resolves to Kagoshima.
    expect(nearestAreaGuide({ lat: 31.59, lng: 130.56 }, guides)?.id).toBe('kagoshima');
  });

  it('returns null when there are no guides', () => {
    expect(nearestAreaGuide({ lat: 33, lng: 131 }, [])).toBeNull();
  });
});

describe('sortAreaGuidesByName', () => {
  const aso = toCachedAreaGuide('aso', areaGuideDoc({ name: { en: 'Aso', ja: '阿蘇' } }));
  const beppu = toCachedAreaGuide('beppu', areaGuideDoc({ name: { en: 'Beppu', ja: '別府' } }));
  const yufuin = toCachedAreaGuide('yufuin', areaGuideDoc({ name: { en: 'Yufuin', ja: '由布院' } }));
  const guides: CachedAreaGuide[] = [yufuin, beppu, aso];

  it('sorts by English name ascending for a non-ja locale', () => {
    expect(sortAreaGuidesByName(guides, 'en').map((g) => g.id)).toEqual([
      'aso',
      'beppu',
      'yufuin',
    ]);
  });

  it('sorts deterministically for ja, keeping every region exactly once', () => {
    const ids = sortAreaGuidesByName(guides, 'ja').map((g) => g.id);
    // Same set, no drops or duplicates.
    expect([...ids].sort()).toEqual(['aso', 'beppu', 'yufuin']);
    // Sorting again yields the identical order.
    expect(sortAreaGuidesByName(guides, 'ja').map((g) => g.id)).toEqual(ids);
  });

  it('does not mutate the input array', () => {
    const input = [yufuin, beppu, aso];
    const before = input.map((g) => g.id);
    sortAreaGuidesByName(input, 'en');
    expect(input.map((g) => g.id)).toEqual(before);
  });

  it('returns an empty array for empty input', () => {
    expect(sortAreaGuidesByName([], 'en')).toEqual([]);
  });
});
