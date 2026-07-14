import type { CachedAreaGuide } from '@kyuhachi/shared';
import { pickLocalized, nearestAreaGuide } from '@/lib/area-guide';
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
