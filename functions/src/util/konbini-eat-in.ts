/**
 * Pure logic for the konbini eat-in batch job (scripts/konbini-eat-in.ts):
 * the Overpass query, the route buffer filter, the evidence rules for each
 * source, the merge that turns evidence into a status, and the cost model.
 *
 * Lives here rather than beside the script so it is typechecked and unit
 * tested by the Functions package in CI (the same arrangement as track.ts,
 * which the journey import script shares). Nothing in this file does I/O.
 *
 * Precision first: a false "yes" sends a hiker to a store with nowhere to sit,
 * a missed one costs nothing. So positive evidence has to be explicit,
 * contradictions resolve to "unknown", and photos can only ever reach
 * "likely".
 */

import { haversineMeters, type LatLng } from './track';

// ---------------------------------------------------------------------------
// Types mirrored from shared/src/types/konbini.ts (Functions cannot import the
// shared package); keep the two in sync.
// ---------------------------------------------------------------------------

export type EatInStatus = 'yes' | 'likely' | 'unknown' | 'no';

export type EatInSourceKind = 'osm_tags' | 'google_dine_in' | 'google_reviews' | 'google_photos';

export interface EatInSource {
  kind: EatInSourceKind;
  verdict: 'yes' | 'likely' | 'no';
  detail: string;
}

// ---------------------------------------------------------------------------
// OpenStreetMap
// ---------------------------------------------------------------------------

/** One element of an Overpass `[out:json]` response with `out center tags`. */
export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** A convenience store taken from OSM, before any eat-in evidence. */
export interface StoreCandidate {
  /** "node/123" or "way/456". */
  osmId: string;
  /** The /konbini document id: "osm-node-123". */
  docId: string;
  name: string;
  brand: string | null;
  lat: number;
  lng: number;
  tags: Record<string, string>;
}

/** Coordinate precision in the Overpass query, ~1 m; the route is stored at 5 places anyway. */
const QUERY_DECIMALS = 5;

/**
 * Overpass QL for every `shop=convenience` node, way or relation within
 * `bufferMeters` of the route polyline. `around` with a coordinate list is
 * Overpass's own linestring buffer, so the server does the geometry and the
 * response is just the stores (a bounding-box query over a 1,200 km loop would
 * pull most of Kyushu's stores instead). `out center` gives ways a centroid so
 * every element has a coordinate.
 */
export function buildOverpassQuery(route: LatLng[], bufferMeters: number): string {
  if (route.length < 2) throw new Error('route needs at least two points');
  const coords = route
    .map((p) => `${p.lat.toFixed(QUERY_DECIMALS)},${p.lng.toFixed(QUERY_DECIMALS)}`)
    .join(',');
  return (
    `[out:json][timeout:300];` +
    `nwr["shop"="convenience"](around:${Math.round(bufferMeters)},${coords});` +
    `out center tags;`
  );
}

/** How close two OSM elements must be, with the same name, to count as one store. */
const DUPLICATE_RADIUS_METERS = 60;

/**
 * Turn Overpass elements into store candidates: keep named convenience stores
 * with a coordinate, and collapse the common mapping duplicate where a store
 * is both a building way and a shop node inside it (same name within 60 m),
 * preferring the node. Elements without a name are dropped: a nameless store
 * cannot be matched to an Apple Maps result in the app, so a badge for it
 * could never be shown.
 */
export function candidatesFromOsm(elements: OsmElement[]): StoreCandidate[] {
  const seen: StoreCandidate[] = [];
  const ordered = [...elements].sort((a, b) => rank(a) - rank(b));
  for (const el of ordered) {
    const tags = el.tags ?? {};
    if (tags.shop !== 'convenience') continue;
    const name = (tags.name ?? tags['name:ja'] ?? tags.brand ?? '').trim();
    if (!name) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;

    const candidate: StoreCandidate = {
      osmId: `${el.type}/${el.id}`,
      docId: `osm-${el.type}-${el.id}`,
      name,
      brand: tags.brand?.trim() || null,
      lat,
      lng,
      tags,
    };
    const duplicate = seen.some(
      (s) =>
        normalizeName(s.name) === normalizeName(name) &&
        haversineMeters(s, candidate) <= DUPLICATE_RADIUS_METERS
    );
    if (!duplicate) seen.push(candidate);
  }
  return seen;
}

function rank(el: OsmElement): number {
  return el.type === 'node' ? 0 : el.type === 'way' ? 1 : 2;
}

function normalizeName(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

// ---------------------------------------------------------------------------
// Route buffer
// ---------------------------------------------------------------------------

const METRES_PER_DEG_LAT = 111_320;

/**
 * Shortest distance from a point to a polyline in metres: the closest approach
 * to any segment, in a local equirectangular frame centred on the point. Same
 * approach as the app's geo.ts; exact enough at the few-kilometre scale the
 * buffer works at.
 */
export function distanceToPolylineMeters(point: LatLng, line: LatLng[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return haversineMeters(point, line[0]);
  const metresPerDegLng = METRES_PER_DEG_LAT * Math.cos((point.lat * Math.PI) / 180);
  const project = (c: LatLng) => ({
    x: (c.lng - point.lng) * metresPerDegLng,
    y: (c.lat - point.lat) * METRES_PER_DEG_LAT,
  });
  let min = Infinity;
  let prev = project(line[0]);
  for (let i = 1; i < line.length; i++) {
    const curr = project(line[i]);
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(prev.x * dx + prev.y * dy) / lenSq));
    const d = Math.hypot(prev.x + t * dx, prev.y + t * dy);
    if (d < min) min = d;
    prev = curr;
  }
  return min;
}

export interface StoreNearRoute {
  store: StoreCandidate;
  routeOffsetKm: number;
}

/**
 * The candidates within `bufferKm` of the route, each with its offset, in
 * order of increasing offset. Overpass already applied the buffer server-side;
 * this re-applies it exactly against the full-resolution route so the stored
 * `routeOffsetKm` is honest and a mirror's looser geometry cannot let an
 * outlier through.
 */
export function storesNearRoute(
  candidates: StoreCandidate[],
  route: LatLng[],
  bufferKm: number
): StoreNearRoute[] {
  const out: StoreNearRoute[] = [];
  for (const store of candidates) {
    const km = distanceToPolylineMeters(store, route) / 1000;
    if (km <= bufferKm) out.push({ store, routeOffsetKm: Math.round(km * 1000) / 1000 });
  }
  return out.sort((a, b) => a.routeOffsetKm - b.routeOffsetKm);
}

// ---------------------------------------------------------------------------
// Stage 1: OSM tags
// ---------------------------------------------------------------------------

/**
 * Eat-in evidence from a store's own OSM tags. `indoor_seating`, `eat_in` and
 * `seating` answer the question directly (any value but "no" is a yes: mappers
 * write yes, bar_table, table, a count); `seats` and `capacity:seats` imply it
 * when positive. `outdoor_seating` is deliberately not evidence: a bench by the
 * door is not an eat-in space. A tag set that says both yes and no is a
 * contradiction and yields nothing, so later stages get to decide.
 */
export function osmTagEvidence(tags: Record<string, string>): EatInSource | null {
  const positives: string[] = [];
  const negatives: string[] = [];
  for (const key of ['indoor_seating', 'eat_in', 'seating']) {
    const value = tags[key]?.trim().toLowerCase();
    if (!value) continue;
    (value === 'no' ? negatives : positives).push(`${key}=${tags[key]}`);
  }
  for (const key of ['seats', 'capacity:seats']) {
    const value = tags[key]?.trim();
    if (!value) continue;
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) (n > 0 ? positives : negatives).push(`${key}=${value}`);
  }
  if (positives.length > 0 && negatives.length === 0) {
    return { kind: 'osm_tags', verdict: 'yes', detail: positives.join(', ') };
  }
  if (negatives.length > 0 && positives.length === 0) {
    return { kind: 'osm_tags', verdict: 'no', detail: negatives.join(', ') };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stage 2: Google Places
// ---------------------------------------------------------------------------

/**
 * Google's `dineIn` attribute is evidence only when true. A false or absent
 * value is not a "no": the attribute is rarely maintained for Japanese chains
 * and reads false by default, so treating it as negative would veto real
 * evidence from reviews and photos.
 */
export function dineInEvidence(dineIn: boolean | undefined | null): EatInSource | null {
  return dineIn === true
    ? { kind: 'google_dine_in', verdict: 'yes', detail: 'dineIn=true' }
    : null;
}

/** Phrases that name an eat-in space, in the languages reviews here come in. */
const EAT_IN_KEYWORDS = /イートイン|店内飲食|座席|eat[\s-]?in|dine[\s-]?in/i;

/**
 * Words that, in the same sentence as a keyword, say the space is absent,
 * closed or merely wished for. Any of them disqualifies the sentence as a
 * positive (precision first), and makes it a negative instead.
 */
const NEGATION =
  /ない|無い|なし|無し|ありません|ございません|撤去|廃止|閉鎖|休止|中止|使えない|使えません|利用できない|利用できません|使用できない|できません|なくな|無くな|あれば|欲しい|ほしい|希望|\bno\b|\bnot\b|\bwithout\b|\bremoved\b|\bclosed\b|\bgone\b|\bn't\b/i;

const SENTENCE_BREAK = /[。．.!?！?？\n]+/;

export type ReviewClassification = 'positive' | 'negative' | 'none';

/**
 * Whether one review text asserts an eat-in space, denies one, or says nothing
 * about it. Judged sentence by sentence: a sentence that names the space and
 * carries no negation is a positive; one that names it with a negation is a
 * negative. A review with both is a negative, so "there used to be seating but
 * it's gone" never counts as a yes.
 */
export function classifyReviewText(text: string): ReviewClassification {
  let positive = false;
  for (const raw of text.split(SENTENCE_BREAK)) {
    const sentence = raw.trim();
    if (!sentence || !EAT_IN_KEYWORDS.test(sentence)) continue;
    if (NEGATION.test(sentence)) return 'negative';
    positive = true;
  }
  return positive ? 'positive' : 'none';
}

/** The first sentence of `text` that names an eat-in space, shortened for storage. */
function eatInSentence(text: string): string {
  const hit = text.split(SENTENCE_BREAK).find((s) => EAT_IN_KEYWORDS.test(s)) ?? text;
  const trimmed = hit.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed;
}

/**
 * Eat-in evidence from a store's Google reviews. Positives only count when no
 * review contradicts them; a mixed set is a contradiction and yields nothing.
 * Two or more agreeing positives earn slightly more confidence than one.
 */
export function reviewEvidence(texts: string[]): EatInSource | null {
  const positives = texts.filter((t) => classifyReviewText(t) === 'positive');
  const negatives = texts.filter((t) => classifyReviewText(t) === 'negative');
  if (positives.length > 0 && negatives.length === 0) {
    const detail = positives.map(eatInSentence).slice(0, 2).join(' / ');
    return { kind: 'google_reviews', verdict: 'yes', detail: `${positives.length} review(s): ${detail}` };
  }
  if (negatives.length > 0 && positives.length === 0) {
    return { kind: 'google_reviews', verdict: 'no', detail: `${negatives.length} review(s): ${eatInSentence(negatives[0])}` };
  }
  return null;
}

/**
 * How far a Google place may sit from the OSM coordinate and still be the same
 * store. OSM nodes and Google pins for one shop are usually within 30 m; 150 m
 * absorbs a way centroid on a large lot without reaching the next block.
 */
export const PLACE_MATCH_RADIUS_METERS = 150;

/**
 * Whether a Google place is the OSM store: close enough, and not a different
 * chain. `brandKeys` are the chain keys of the two names (null when a name
 * names no chain); the caller derives them with the shared `konbiniBrandKey`.
 */
export function placeMatchesStore(
  place: LatLng,
  store: LatLng,
  brandKeys: { place: string | null; store: string | null }
): boolean {
  if (haversineMeters(place, store) > PLACE_MATCH_RADIUS_METERS) return false;
  if (brandKeys.place && brandKeys.store && brandKeys.place !== brandKeys.store) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Stage 3: photos
// ---------------------------------------------------------------------------

/** What the vision model reported for one photo. */
export interface PhotoVerdict {
  seating: 'indoor' | 'outdoor' | 'none' | 'unclear';
  /** The model's own 0 to 1 confidence in `seating`. */
  confidence: number;
}

/** Below this the model's own confidence is too low to act on. */
export const PHOTO_MIN_CONFIDENCE = 0.7;
/** Photos never reach "yes"; this caps how sure a photo-only "likely" can be. */
export const PHOTO_MAX_CONFIDENCE = 0.75;

/**
 * Eat-in evidence from the vision verdicts on a store's photos: "likely" when
 * any photo shows indoor seating at a confidence of at least
 * PHOTO_MIN_CONFIDENCE. Outdoor seating and unclear photos are not evidence.
 */
export function photoEvidence(verdicts: PhotoVerdict[]): EatInSource | null {
  const hits = verdicts
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => v.seating === 'indoor' && v.confidence >= PHOTO_MIN_CONFIDENCE);
  if (hits.length === 0) return null;
  const best = Math.max(...hits.map(({ v }) => v.confidence));
  return {
    kind: 'google_photos',
    verdict: 'likely',
    detail:
      `${hits.length} of ${verdicts.length} photo(s) show indoor seating ` +
      `(photo ${hits.map(({ i }) => i + 1).join(', ')}; model confidence ${best.toFixed(2)})`,
  };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/** Confidence each source carries on its own when it says yes or no. */
const SOURCE_CONFIDENCE: Record<EatInSourceKind, number> = {
  osm_tags: 0.9,
  google_dine_in: 0.85,
  google_reviews: 0.8,
  google_photos: PHOTO_MAX_CONFIDENCE,
};

export interface MergedAssessment {
  status: EatInStatus;
  confidence: number;
}

/**
 * Fold every source's verdict into one status.
 *
 *   yes      at least one "yes" source and no "no" source; agreeing sources
 *            raise confidence a little.
 *   unknown  a "yes" source and a "no" source disagree. Nobody gets a badge on
 *            a coin flip.
 *   no       only "no" sources.
 *   likely   only photo evidence.
 *   unknown  nothing at all.
 */
export function mergeEvidence(sources: EatInSource[]): MergedAssessment {
  const yes = sources.filter((s) => s.verdict === 'yes');
  const no = sources.filter((s) => s.verdict === 'no');
  const likely = sources.filter((s) => s.verdict === 'likely');

  if (yes.length > 0 && no.length > 0) return { status: 'unknown', confidence: 0 };
  if (yes.length > 0) {
    const base = Math.max(...yes.map((s) => SOURCE_CONFIDENCE[s.kind]));
    return { status: 'yes', confidence: round2(Math.min(0.97, base + 0.05 * (yes.length - 1))) };
  }
  if (no.length > 0) {
    return { status: 'no', confidence: round2(Math.max(...no.map((s) => SOURCE_CONFIDENCE[s.kind]))) };
  }
  if (likely.length > 0) return { status: 'likely', confidence: PHOTO_MAX_CONFIDENCE };
  return { status: 'unknown', confidence: 0 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Replace any source of `kind` already in `sources` with `next` (or drop it when null). */
export function replaceSource(
  sources: EatInSource[],
  kind: EatInSourceKind,
  next: EatInSource | null
): EatInSource[] {
  const kept = sources.filter((s) => s.kind !== kind);
  return next ? [...kept, next] : kept;
}

// ---------------------------------------------------------------------------
// Cost model
// ---------------------------------------------------------------------------

/**
 * Google Maps Platform list prices, USD per 1,000 requests, and the free
 * monthly allowance per SKU since the March 2025 pricing change (Essentials
 * 10,000, Pro 5,000, Enterprise 1,000; IDs Only requests are free). A request
 * is billed at the highest SKU among the fields it asks for, so one Place
 * Details call that asks for dineIn and reviews is one Enterprise + Atmosphere
 * request however many cheaper fields ride along. Verify against the live
 * pricing sheet before relying on the numbers for a budget.
 */
export const GOOGLE_PRICING = {
  textSearchIdsOnly: { usdPer1000: 0, freePerMonth: Infinity },
  placeDetailsEnterpriseAtmosphere: { usdPer1000: 25, freePerMonth: 1000 },
  placePhoto: { usdPer1000: 7, freePerMonth: 10_000 },
} as const;

export interface GoogleUsage {
  textSearch: number;
  placeDetails: number;
  placePhotos: number;
}

export interface SpendEstimate {
  /** What the calls cost at list price, as if no free allowance existed. */
  listUsd: number;
  /** What they cost if this month's free allowance is otherwise unused. */
  afterFreeTierUsd: number;
}

export function estimateGoogleSpend(usage: GoogleUsage): SpendEstimate {
  const lines: [number, { usdPer1000: number; freePerMonth: number }][] = [
    [usage.textSearch, GOOGLE_PRICING.textSearchIdsOnly],
    [usage.placeDetails, GOOGLE_PRICING.placeDetailsEnterpriseAtmosphere],
    [usage.placePhotos, GOOGLE_PRICING.placePhoto],
  ];
  let listUsd = 0;
  let afterFreeTierUsd = 0;
  for (const [count, price] of lines) {
    listUsd += (count * price.usdPer1000) / 1000;
    afterFreeTierUsd += (Math.max(0, count - price.freePerMonth) * price.usdPer1000) / 1000;
  }
  return { listUsd: round4(listUsd), afterFreeTierUsd: round4(afterFreeTierUsd) };
}

/** Anthropic list price for the vision model the photo stage uses (Claude Opus 5.5). */
export const CLAUDE_PRICING = { model: 'claude-opus-5-5', inputUsdPerMTok: 4, outputUsdPerMTok: 20 } as const;

export interface ClaudeUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export function estimateClaudeSpend(usage: ClaudeUsage): number {
  return round4(
    (usage.inputTokens * CLAUDE_PRICING.inputUsdPerMTok +
      usage.outputTokens * CLAUDE_PRICING.outputUsdPerMTok) /
      1_000_000
  );
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
