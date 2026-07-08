/**
 * Test fixture: a full `OnsenDocument` with sensible defaults. Lives under
 * `__fixtures__/` (not `__tests__/`) so jest's default testMatch doesn't treat
 * it as a suite.
 */
import type { OnsenDocument } from '@kyuhachi/shared';
import { ts } from '@/lib/stats/__fixtures__/factories';

export function onsenDoc(overrides: Partial<OnsenDocument> = {}): OnsenDocument {
  return {
    name: '山田温泉',
    nameKana: 'やまだおんせん',
    nameRomaji: 'Yamada Onsen',
    areaName: '別府',
    areaId: null,
    address: '大分県別府市1-1',
    prefecture: '大分県',
    lat: 33.28,
    lng: 131.49,
    phone: null,
    businessHours: null,
    admissionFee: null,
    adultFee: null,
    springQuality: null,
    websiteUrl: null,
    imageUrl: null,
    blurhash: null,
    isActive: true,
    catalogVersion: 1,
    createdAt: ts(0),
    updatedAt: ts(0),
    ...overrides,
  };
}
