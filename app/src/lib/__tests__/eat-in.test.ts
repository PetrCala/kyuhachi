import { konbiniBrandKey, type KonbiniDocument } from '@kyuhachi/shared';
import { eatInBadgeFor, matchKonbini } from '@/lib/eat-in';

describe('konbiniBrandKey', () => {
  it('reads the chain from katakana, Latin and abbreviated spellings', () => {
    expect(konbiniBrandKey('セブン-イレブン 別府北浜店')).toBe('seven_eleven');
    expect(konbiniBrandKey('7-Eleven Beppu')).toBe('seven_eleven');
    expect(konbiniBrandKey('セブンイレブン')).toBe('seven_eleven');
    expect(konbiniBrandKey('ローソン 別府駅前店')).toBe('lawson');
    expect(konbiniBrandKey('LAWSON')).toBe('lawson');
    expect(konbiniBrandKey('ファミリーマート 日出店')).toBe('family_mart');
    expect(konbiniBrandKey('ファミマ')).toBe('family_mart');
    expect(konbiniBrandKey('FamilyMart')).toBe('family_mart');
    expect(konbiniBrandKey('デイリーヤマザキ 日田店')).toBe('daily_yamazaki');
    expect(konbiniBrandKey('ミニストップ 霧島店')).toBe('ministop');
  });

  it('is null for a name that names no chain', () => {
    expect(konbiniBrandKey('コンビニ')).toBeNull();
    expect(konbiniBrandKey('よろず屋')).toBeNull();
  });
});

function konbini(
  name: string,
  lat: number,
  lng: number,
  status: KonbiniDocument['eatIn']['status'] = 'yes'
): KonbiniDocument {
  const ts = { seconds: 0, nanoseconds: 0, toDate: () => new Date(0), toMillis: () => 0 };
  return {
    name,
    brand: null,
    lat,
    lng,
    town: null,
    osmId: 'node/1',
    googlePlaceId: null,
    routeOffsetKm: 0,
    eatIn: { status, confidence: 0.9, sources: [], checkedAt: ts },
    createdAt: ts,
    updatedAt: ts,
  };
}

// ~55 m apart: the same shop as seen by two map providers.
const LAWSON = konbini('ローソン 別府北浜店', 33.2845, 131.5035);
const NEAR_LAWSON = { name: 'ローソン 別府北浜', lat: 33.2849, lng: 131.5038 };
// A 7-Eleven 70 m across the street.
const SEVEN = konbini('セブン-イレブン 別府北浜店', 33.2851, 131.5031, 'likely');

describe('matchKonbini', () => {
  it('matches the nearest document within the radius', () => {
    expect(matchKonbini(NEAR_LAWSON, [SEVEN, LAWSON])).toBe(LAWSON);
  });

  it('ignores a document beyond the radius', () => {
    expect(matchKonbini({ name: 'ローソン', lat: 33.29, lng: 131.5035 }, [LAWSON])).toBeNull();
  });

  it('never matches across chains, even when the other chain is nearer', () => {
    // A 7-Eleven result right on top of the Lawson document.
    const poi = { name: '7-Eleven 別府北浜', lat: 33.2845, lng: 131.5035 };
    expect(matchKonbini(poi, [LAWSON, SEVEN])).toBe(SEVEN);
    expect(matchKonbini(poi, [LAWSON])).toBeNull();
  });

  it('matches on position alone when a name names no chain', () => {
    const poi = { name: 'コンビニ', lat: 33.2845, lng: 131.5035 };
    expect(matchKonbini(poi, [LAWSON])).toBe(LAWSON);
  });
});

describe('eatInBadgeFor', () => {
  it('badges yes and likely only', () => {
    expect(eatInBadgeFor(NEAR_LAWSON, [LAWSON])).toBe('yes');
    expect(eatInBadgeFor({ name: 'セブンイレブン', lat: 33.2851, lng: 131.5031 }, [SEVEN])).toBe('likely');
    expect(eatInBadgeFor(NEAR_LAWSON, [konbini('ローソン 別府北浜店', 33.2845, 131.5035, 'unknown')])).toBeNull();
    expect(eatInBadgeFor(NEAR_LAWSON, [konbini('ローソン 別府北浜店', 33.2845, 131.5035, 'no')])).toBeNull();
  });

  it('is null with no documents', () => {
    expect(eatInBadgeFor(NEAR_LAWSON, [])).toBeNull();
  });
});
