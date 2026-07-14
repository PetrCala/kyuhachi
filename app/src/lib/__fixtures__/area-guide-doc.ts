/**
 * Test fixture: a full `AreaGuideDocument` with sensible defaults. Lives under
 * `__fixtures__/` (not `__tests__/`) so jest's default testMatch doesn't treat
 * it as a suite.
 */
import type { AreaGuideDocument } from '@kyuhachi/shared';
import { ts } from '@/lib/stats/__fixtures__/factories';

export function areaGuideDoc(overrides: Partial<AreaGuideDocument> = {}): AreaGuideDocument {
  return {
    name: { en: 'Beppu', ja: '別府' },
    tagline: { en: "Japan's onsen capital", ja: '日本一の湯のまち' },
    center: { lat: 33.28, lng: 131.5 },
    sections: [
      {
        kind: 'specialties',
        body: { en: 'Steamed over hot-spring vents.', ja: '源泉の噴気で蒸す。' },
        highlights: [{ en: 'Jigoku-mushi', ja: '地獄蒸し' }],
      },
      { kind: 'history', body: { en: "Modern Japan's bathing resort.", ja: '近代日本の湯治場。' } },
    ],
    version: 1,
    updatedAt: ts(0),
    ...overrides,
  };
}
