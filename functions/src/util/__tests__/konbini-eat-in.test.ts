import { describe, expect, test } from '@jest/globals';
import {
  buildOverpassQuery,
  candidatesFromOsm,
  classifyReviewText,
  dineInEvidence,
  distanceToPolylineMeters,
  estimateClaudeSpend,
  estimateGoogleSpend,
  mergeEvidence,
  osmTagEvidence,
  photoEvidence,
  placeMatchesStore,
  replaceSource,
  reviewEvidence,
  storesNearRoute,
  type EatInSource,
  type OsmElement,
} from '../konbini-eat-in';

// A short east-bound route in Oita; each segment is ~9 km.
const ROUTE = [
  { lat: 33.3, lng: 131.4 },
  { lat: 33.3, lng: 131.5 },
  { lat: 33.3, lng: 131.6 },
];

function node(id: number, lat: number, lon: number, tags: Record<string, string>): OsmElement {
  return { type: 'node', id, lat, lon, tags: { shop: 'convenience', ...tags } };
}

describe('buildOverpassQuery', () => {
  test('buffers the route as a linestring and asks for centres and tags', () => {
    const q = buildOverpassQuery(ROUTE, 2000);
    expect(q).toContain('[out:json]');
    expect(q).toContain('nwr["shop"="convenience"](around:2000,33.30000,131.40000,33.30000,131.50000,33.30000,131.60000)');
    expect(q).toContain('out center tags;');
  });

  test('rejects a route with fewer than two points', () => {
    expect(() => buildOverpassQuery([ROUTE[0]], 2000)).toThrow();
  });
});

describe('candidatesFromOsm', () => {
  test('keeps named convenience stores, drops nameless ones and other shops', () => {
    const out = candidatesFromOsm([
      node(1, 33.3, 131.41, { name: 'ローソン 別府駅前店', brand: 'ローソン' }),
      node(2, 33.3, 131.42, {}),
      { type: 'node', id: 3, lat: 33.3, lon: 131.43, tags: { shop: 'supermarket', name: 'マルショク' } },
    ]);
    expect(out.map((s) => s.docId)).toEqual(['osm-node-1']);
    expect(out[0]).toMatchObject({ osmId: 'node/1', brand: 'ローソン', lat: 33.3, lng: 131.41 });
  });

  test('uses a way centre and collapses a building way onto its shop node', () => {
    const out = candidatesFromOsm([
      {
        type: 'way',
        id: 10,
        center: { lat: 33.3001, lon: 131.4101 },
        tags: { shop: 'convenience', name: 'セブン-イレブン 別府北浜店' },
      },
      node(11, 33.3, 131.41, { name: 'セブン-イレブン 別府北浜店' }),
      {
        type: 'way',
        id: 12,
        center: { lat: 33.35, lon: 131.45 },
        tags: { shop: 'convenience', name: 'ファミリーマート 日出店' },
      },
    ]);
    expect(out.map((s) => s.osmId)).toEqual(['node/11', 'way/12']);
    expect(out[1]).toMatchObject({ lat: 33.35, lng: 131.45 });
  });

  test('keeps two same-chain stores that are far apart', () => {
    const out = candidatesFromOsm([
      node(1, 33.3, 131.41, { name: 'ローソン' }),
      node(2, 33.3, 131.45, { name: 'ローソン' }),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('distanceToPolylineMeters / storesNearRoute', () => {
  test('measures to the nearest segment, not the nearest vertex', () => {
    // Midway between two vertices, 1 km north of the line.
    const d = distanceToPolylineMeters({ lat: 33.309, lng: 131.45 }, ROUTE);
    expect(d).toBeGreaterThan(950);
    expect(d).toBeLessThan(1050);
  });

  test('keeps stores inside the buffer, ordered by offset, with the offset recorded', () => {
    const near = candidatesFromOsm([
      node(1, 33.315, 131.45, { name: 'far' }), // ~1.7 km
      node(2, 33.302, 131.52, { name: 'near' }), // ~0.2 km
      node(3, 33.33, 131.45, { name: 'out' }), // ~3.3 km
    ]);
    const out = storesNearRoute(near, ROUTE, 2);
    expect(out.map((s) => s.store.name)).toEqual(['near', 'far']);
    expect(out[0].routeOffsetKm).toBeCloseTo(0.22, 1);
  });
});

describe('osmTagEvidence', () => {
  test('any seating tag but "no" is a yes', () => {
    expect(osmTagEvidence({ indoor_seating: 'yes' })).toEqual({
      kind: 'osm_tags',
      verdict: 'yes',
      detail: 'indoor_seating=yes',
    });
    expect(osmTagEvidence({ indoor_seating: 'bar_table' })?.verdict).toBe('yes');
    expect(osmTagEvidence({ eat_in: 'yes' })?.verdict).toBe('yes');
    expect(osmTagEvidence({ seats: '8' })?.verdict).toBe('yes');
  });

  test('explicit "no" is a no', () => {
    expect(osmTagEvidence({ indoor_seating: 'no' })).toEqual({
      kind: 'osm_tags',
      verdict: 'no',
      detail: 'indoor_seating=no',
    });
  });

  test('outdoor seating alone, or no tags, is not evidence', () => {
    expect(osmTagEvidence({ outdoor_seating: 'yes' })).toBeNull();
    expect(osmTagEvidence({ name: 'x' })).toBeNull();
  });

  test('contradictory tags yield nothing', () => {
    expect(osmTagEvidence({ indoor_seating: 'yes', eat_in: 'no' })).toBeNull();
  });
});

describe('dineInEvidence', () => {
  test('only true counts', () => {
    expect(dineInEvidence(true)?.verdict).toBe('yes');
    expect(dineInEvidence(false)).toBeNull();
    expect(dineInEvidence(undefined)).toBeNull();
  });
});

describe('classifyReviewText', () => {
  test('a plain mention is positive', () => {
    expect(classifyReviewText('イートインスペースがあって助かりました。')).toBe('positive');
    expect(classifyReviewText('店内飲食できます')).toBe('positive');
    expect(classifyReviewText('Clean store with an eat-in corner.')).toBe('positive');
  });

  test('a negated mention is negative', () => {
    expect(classifyReviewText('イートインスペースはありません。')).toBe('negative');
    expect(classifyReviewText('座席がないので持ち帰りました')).toBe('negative');
    expect(classifyReviewText('イートインは休止中です')).toBe('negative');
    expect(classifyReviewText('No eat-in here, takeout only.')).toBe('negative');
  });

  test('a wish is not a positive', () => {
    expect(classifyReviewText('イートインがあれば最高なのに')).toBe('negative');
  });

  test('a review that both affirms and denies is negative', () => {
    expect(classifyReviewText('以前はイートインがありました。今はイートインは撤去されています。')).toBe('negative');
  });

  test('negation in another sentence does not poison a mention', () => {
    expect(classifyReviewText('駐車場はない。イートインスペースは広い。')).toBe('positive');
  });

  test('no mention is none', () => {
    expect(classifyReviewText('品揃えが良いです')).toBe('none');
  });
});

describe('reviewEvidence', () => {
  test('agreeing positives are a yes with the matched sentence as detail', () => {
    const out = reviewEvidence(['イートインスペースあり。', '品揃え良い', 'eat-in seating upstairs']);
    expect(out?.verdict).toBe('yes');
    expect(out?.detail).toContain('2 review(s)');
    expect(out?.detail).toContain('イートインスペースあり');
  });

  test('a mixed set is a contradiction', () => {
    expect(reviewEvidence(['イートインあり', 'イートインはありません'])).toBeNull();
  });

  test('only negatives are a no', () => {
    expect(reviewEvidence(['座席はありません'])?.verdict).toBe('no');
  });

  test('nothing relevant is nothing', () => {
    expect(reviewEvidence(['おにぎりが美味しい', ''])).toBeNull();
  });
});

describe('placeMatchesStore', () => {
  const store = { lat: 33.3, lng: 131.5 };

  test('close and same chain (or chain unknown) matches', () => {
    const near = { lat: 33.3003, lng: 131.5003 }; // ~45 m
    expect(placeMatchesStore(near, store, { place: 'lawson', store: 'lawson' })).toBe(true);
    expect(placeMatchesStore(near, store, { place: null, store: 'lawson' })).toBe(true);
  });

  test('a different chain across the street does not match', () => {
    const near = { lat: 33.3003, lng: 131.5003 };
    expect(placeMatchesStore(near, store, { place: 'seven_eleven', store: 'lawson' })).toBe(false);
  });

  test('too far does not match', () => {
    expect(placeMatchesStore({ lat: 33.302, lng: 131.5 }, store, { place: null, store: null })).toBe(false);
  });
});

describe('photoEvidence', () => {
  test('confident indoor seating is likely', () => {
    const out = photoEvidence([
      { seating: 'none', confidence: 0.9 },
      { seating: 'indoor', confidence: 0.8 },
    ]);
    expect(out?.verdict).toBe('likely');
    expect(out?.detail).toContain('photo 2');
  });

  test('low confidence, outdoor or unclear is not evidence', () => {
    expect(photoEvidence([{ seating: 'indoor', confidence: 0.5 }])).toBeNull();
    expect(photoEvidence([{ seating: 'outdoor', confidence: 0.95 }])).toBeNull();
    expect(photoEvidence([{ seating: 'unclear', confidence: 0.95 }])).toBeNull();
    expect(photoEvidence([])).toBeNull();
  });
});

describe('mergeEvidence', () => {
  const osmYes: EatInSource = { kind: 'osm_tags', verdict: 'yes', detail: 'indoor_seating=yes' };
  const reviewYes: EatInSource = { kind: 'google_reviews', verdict: 'yes', detail: '1 review(s)' };
  const reviewNo: EatInSource = { kind: 'google_reviews', verdict: 'no', detail: '1 review(s)' };
  const photoLikely: EatInSource = { kind: 'google_photos', verdict: 'likely', detail: '1 of 3' };

  test('nothing is unknown', () => {
    expect(mergeEvidence([])).toEqual({ status: 'unknown', confidence: 0 });
  });

  test('a yes source is a yes; agreeing sources raise confidence', () => {
    expect(mergeEvidence([reviewYes])).toEqual({ status: 'yes', confidence: 0.8 });
    expect(mergeEvidence([osmYes, reviewYes])).toEqual({ status: 'yes', confidence: 0.95 });
  });

  test('a contradiction is unknown, never a yes', () => {
    expect(mergeEvidence([osmYes, reviewNo])).toEqual({ status: 'unknown', confidence: 0 });
    expect(mergeEvidence([osmYes, reviewNo, photoLikely]).status).toBe('unknown');
  });

  test('only negatives is a no', () => {
    expect(mergeEvidence([reviewNo])).toEqual({ status: 'no', confidence: 0.8 });
  });

  test('photos alone reach likely, never yes', () => {
    expect(mergeEvidence([photoLikely])).toEqual({ status: 'likely', confidence: 0.75 });
  });

  test('a yes beats a photo', () => {
    expect(mergeEvidence([photoLikely, reviewYes]).status).toBe('yes');
  });
});

describe('replaceSource', () => {
  test('swaps the source of a kind in place and drops it on null', () => {
    const a: EatInSource = { kind: 'osm_tags', verdict: 'yes', detail: 'old' };
    const b: EatInSource = { kind: 'google_reviews', verdict: 'yes', detail: 'r' };
    const next: EatInSource = { kind: 'osm_tags', verdict: 'no', detail: 'new' };
    expect(replaceSource([a, b], 'osm_tags', next)).toEqual([b, next]);
    expect(replaceSource([a, b], 'osm_tags', null)).toEqual([b]);
  });
});

describe('cost model', () => {
  test('bills details and photos at list price, text search free', () => {
    const out = estimateGoogleSpend({ textSearch: 100, placeDetails: 100, placePhotos: 300 });
    expect(out.listUsd).toBeCloseTo(2.5 + 2.1, 4);
    expect(out.afterFreeTierUsd).toBe(0);
  });

  test('charges only what exceeds the free allowance', () => {
    const out = estimateGoogleSpend({ textSearch: 0, placeDetails: 1200, placePhotos: 0 });
    expect(out.afterFreeTierUsd).toBeCloseTo(5, 4);
  });

  test('prices Claude tokens', () => {
    expect(estimateClaudeSpend({ requests: 1, inputTokens: 1_000_000, outputTokens: 100_000 })).toBe(6);
  });
});
