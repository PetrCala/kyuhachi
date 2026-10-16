/**
 * One-off batch job: flag which convenience stores (コンビニ) along the planned
 * route have an eat-in space, and publish the results to /konbini so the
 * finder can badge them. Pure logic (evidence rules, merge, cost model) lives
 * in functions/src/util/konbini-eat-in.ts, where it is unit tested; this file
 * is the I/O around it.
 *
 * Stages, cheapest first. Each later stage runs only for the stores the
 * earlier ones left "unknown":
 *   1. OpenStreetMap via Overpass: every shop=convenience within the buffer of
 *      the route, with seating tags as evidence. Free.
 *   2. Google Places API (New): match each store to a place (Text Search, IDs
 *      only: free), then one Place Details call for dineIn + reviews (billed
 *      as Enterprise + Atmosphere, 1,000 free per month).
 *   3. Up to --max-photos of the place's photos, judged by a vision model
 *      (Claude) for indoor seating. Each photo fetch is a Place Photo request
 *      (10,000 free per month); the model call is Anthropic usage.
 *
 * Idempotent and re-runnable: document ids are the OSM element ids, so a
 * re-run upserts the same documents and createdAt survives; a store already
 * answered in Firestore is not looked up again; and every raw API response and
 * photo verdict is cached under --cache-dir, so re-running after a crash or a
 * rule tweak costs nothing for stores already fetched. --refresh-google looks
 * everything up again.
 *
 * Spend guard: paid calls are counted at LIST price, as if no free allowance
 * existed (the safe direction). The job refuses to start a stage whose
 * projected total would pass --max-spend-usd (default 10), and stops mid-stage
 * before any call that would cross it. The summary reports both the list
 * price and the charge expected after the monthly free allowance.
 *
 * === Running ===
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json \
 *   GOOGLE_MAPS_API_KEY=...  \   stage 2 + 3 (needs "Places API (New)" enabled on the key)
 *   ANTHROPIC_API_KEY=...    \   stage 3; omit to skip the photo stage
 *   npm run konbini:eat-in -- [flags]
 *
 * The service account key is the same one the other scripts use:
 * https://console.firebase.google.com/project/kyuhachi-fddcc/settings/serviceaccounts/adminsdk
 * Store it outside the repository.
 *
 * Flags:
 *   --dry-run            write nothing to Firestore; still calls the APIs it has keys for
 *   --route-id <id>      a /users/<journey uid>/routes document; default: the default challenge's activeRouteId
 *   --gpx <file>         use a local .gpx/.kml/.tcx track instead of a Firestore route
 *   --buffer-km <n>      corridor half-width in km, default 2
 *   --osm-file <file>    a saved Overpass JSON response (e.g. an overpass-turbo export) instead of querying
 *   --skip-google        stop after stage 1
 *   --skip-photos        stop after stage 2
 *   --max-photos <n>     photos judged per store, default 3
 *   --max-spend-usd <n>  list-price cap for this run, default 10
 *   --limit <n>          only the first n unresolved stores (nearest the route first) reach the paid stages
 *   --refresh-google     ignore cached Google responses and prior Firestore answers
 *   --cache-dir <dir>    default .cache/konbini-eat-in (git-ignored)
 *   --report <file>      Markdown summary, default <cache-dir>/report.md
 *
 * A --dry-run with no keys needs no credentials at all: the route and the
 * onsen catalog are public reads, and Overpass is free.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, extname, resolve } from 'path';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { DOMParser } from '@xmldom/xmldom';
import { gpx, kml, tcx } from '@tmcw/togeojson';
import type { Feature, Geometry, LineString, MultiLineString, Position } from 'geojson';
import {
  CATALOG_INDEX_DOC_ID,
  COLLECTIONS,
  JOURNEY_UID,
  SUBCOLLECTIONS,
  konbiniBrandKey,
  type CatalogIndexEntry,
  type EatInAssessment,
  type EatInSource,
  type EatInStatus,
  type KonbiniDocument,
} from '../shared/src';
import {
  CLAUDE_PRICING,
  GOOGLE_PRICING,
  buildOverpassQuery,
  candidatesFromOsm,
  dineInEvidence,
  estimateClaudeSpend,
  estimateGoogleSpend,
  mergeEvidence,
  osmTagEvidence,
  photoEvidence,
  placeMatchesStore,
  replaceSource,
  reviewEvidence,
  storesNearRoute,
  type ClaudeUsage,
  type GoogleUsage,
  type OsmElement,
  type PhotoVerdict,
  type StoreCandidate,
  type StoreNearRoute,
} from '../functions/src/util/konbini-eat-in';
import { haversineMeters, type LatLng } from '../functions/src/util/track';

const PROJECT_ID = 'kyuhachi-fddcc';
const FIRESTORE_REST = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
/**
 * Overridable so the paid stages can be exercised against a local mock server
 * (the Anthropic SDK honours ANTHROPIC_BASE_URL for the same purpose).
 */
const PLACES_API = process.env.KONBINI_PLACES_API_BASE ?? 'https://places.googleapis.com/v1';
/** The fields the one Place Details call asks for; billed at the highest SKU among them. */
const PLACE_DETAILS_FIELDS =
  'id,displayName,location,addressComponents,businessStatus,dineIn,reviews,photos';
/** Half-width of the box a store's Google place is searched in, metres. */
const TEXT_SEARCH_BOX_METERS = 150;
/** Width of the photos sent to the vision model; enough to see a counter, cheap to send. */
const PHOTO_MAX_WIDTH_PX = 800;
/** A store further than this from every onsen gets no "town" from the catalog. */
const TOWN_FALLBACK_RADIUS_METERS = 15_000;
const USER_AGENT = 'kyuhachi-konbini-eat-in/1 (https://github.com/petrcala/kyuhachi)';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Options {
  dryRun: boolean;
  routeId: string | null;
  gpx: string | null;
  bufferKm: number;
  osmFile: string | null;
  skipGoogle: boolean;
  skipPhotos: boolean;
  maxPhotos: number;
  maxSpendUsd: number;
  limit: number | null;
  refreshGoogle: boolean;
  cacheDir: string;
  report: string;
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    dryRun: false,
    routeId: null,
    gpx: null,
    bufferKm: 2,
    osmFile: null,
    skipGoogle: false,
    skipPhotos: false,
    maxPhotos: 3,
    maxSpendUsd: 10,
    limit: null,
    refreshGoogle: false,
    cacheDir: '.cache/konbini-eat-in',
    report: '',
  };
  const next = (flag: string, i: number): string => {
    const v = argv[i + 1];
    if (v == null || v.startsWith('--')) fail(`${flag} needs a value`);
    return v;
  };
  const number = (flag: string, i: number): number => {
    const n = Number(next(flag, i));
    if (!Number.isFinite(n) || n < 0) fail(`${flag} must be a non-negative number`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--dry-run': opts.dryRun = true; break;
      case '--route-id': opts.routeId = next(a, i++); break;
      case '--gpx': opts.gpx = next(a, i++); break;
      case '--buffer-km': opts.bufferKm = number(a, i++); break;
      case '--osm-file': opts.osmFile = next(a, i++); break;
      case '--skip-google': opts.skipGoogle = true; break;
      case '--skip-photos': opts.skipPhotos = true; break;
      case '--max-photos': opts.maxPhotos = Math.floor(number(a, i++)); break;
      case '--max-spend-usd': opts.maxSpendUsd = number(a, i++); break;
      case '--limit': opts.limit = Math.floor(number(a, i++)); break;
      case '--refresh-google': opts.refreshGoogle = true; break;
      case '--cache-dir': opts.cacheDir = next(a, i++); break;
      case '--report': opts.report = next(a, i++); break;
      case '--help': case '-h':
        console.log(readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*\n/, ''));
        process.exit(0);
        break;
      default: fail(`unknown argument: ${a} (try --help)`);
    }
  }
  if (!opts.report) opts.report = join(opts.cacheDir, 'report.md');
  return opts;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function log(message: string): void {
  console.log(message);
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

async function fetchJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Firestore REST (public reads only: the route and the catalog index)
// ---------------------------------------------------------------------------

interface RestValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, RestValue> };
  arrayValue?: { values?: RestValue[] };
}

interface RestDocument {
  name: string;
  fields?: Record<string, RestValue>;
}

function decodeRestValue(v: RestValue): unknown {
  if (v.stringValue != null) return v.stringValue;
  if (v.integerValue != null) return Number(v.integerValue);
  if (v.doubleValue != null) return v.doubleValue;
  if (v.booleanValue != null) return v.booleanValue;
  if (v.timestampValue != null) return v.timestampValue;
  if (v.mapValue) return decodeRestFields(v.mapValue.fields ?? {});
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(decodeRestValue);
  return null;
}

function decodeRestFields(fields: Record<string, RestValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeRestValue(v);
  return out;
}

async function restGetDocument(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FIRESTORE_REST}/${path}`, { signal: AbortSignal.timeout(60_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore REST ${res.status} for ${path}`);
  const doc = (await res.json()) as RestDocument;
  return decodeRestFields(doc.fields ?? {});
}

async function restListDocuments(path: string, fieldPaths: string[]): Promise<Record<string, unknown>[]> {
  const mask = fieldPaths.map((f) => `mask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const out: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  do {
    const url = `${FIRESTORE_REST}/${path}?pageSize=300&${mask}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const page = await fetchJson<{ documents?: RestDocument[]; nextPageToken?: string }>(url, {}, 60_000);
    for (const d of page.documents ?? []) {
      out.push({ ...decodeRestFields(d.fields ?? {}), __id: d.name.split('/').pop() });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

interface Route {
  name: string;
  points: LatLng[];
}

async function defaultRouteId(): Promise<string> {
  const challenges = await restListDocuments(
    `${COLLECTIONS.USERS}/${JOURNEY_UID}/${SUBCOLLECTIONS.CHALLENGES}`,
    ['isDefault', 'activeRouteId']
  );
  const byDefault = challenges.find((c) => c.isDefault === true) ?? challenges[0];
  const routeId = byDefault?.activeRouteId;
  if (typeof routeId !== 'string' || !routeId) {
    fail('the default challenge has no activeRouteId; pass --route-id or --gpx');
  }
  return routeId;
}

async function loadFirestoreRoute(routeId: string | null): Promise<Route> {
  const id = routeId ?? (await defaultRouteId());
  const doc = await restGetDocument(`${COLLECTIONS.USERS}/${JOURNEY_UID}/${SUBCOLLECTIONS.ROUTES}/${id}`);
  if (!doc) fail(`route ${id} not found`);
  const points = (doc.points as { lat: number; lng: number }[] | undefined) ?? [];
  if (points.length < 2) fail(`route ${id} has fewer than two points`);
  return { name: String(doc.name ?? id), points: points.map(({ lat, lng }) => ({ lat, lng })) };
}

function loadTrackFile(path: string): Route {
  const format = extname(path).slice(1).toLowerCase();
  const doc = new DOMParser().parseFromString(readFileSync(path, 'utf8'), 'text/xml') as unknown as Document;
  const collection =
    format === 'gpx' ? gpx(doc) : format === 'kml' ? kml(doc) : format === 'tcx' ? tcx(doc) : null;
  if (!collection) fail(`unsupported track file: ${path} (use .gpx, .kml or .tcx)`);
  const track = collection.features.find(
    (f: Feature<Geometry | null>): f is Feature<LineString | MultiLineString> =>
      f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'
  );
  if (!track) fail(`no track found in ${path}`);
  const positions: Position[] =
    track.geometry.type === 'LineString' ? track.geometry.coordinates : track.geometry.coordinates.flat();
  const points = positions
    .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng))
    .map(([lng, lat]) => ({ lat, lng }));
  if (points.length < 2) fail(`${path} has fewer than two usable points`);
  const name = typeof track.properties?.name === 'string' ? track.properties.name : path;
  return { name, points };
}

// ---------------------------------------------------------------------------
// Stage 1: OpenStreetMap
// ---------------------------------------------------------------------------

interface OverpassResponse {
  elements: OsmElement[];
}

interface OverpassCache {
  query: string;
  fetchedAt: string;
  endpoint: string;
  elements: OsmElement[];
}

async function loadOsm(route: LatLng[], bufferKm: number, opts: Options): Promise<OsmElement[]> {
  if (opts.osmFile) {
    const parsed = readJson<OverpassResponse>(opts.osmFile);
    if (!parsed?.elements) fail(`${opts.osmFile} is not an Overpass JSON response`);
    log(`osm: ${parsed.elements.length} elements from ${opts.osmFile}`);
    return parsed.elements;
  }

  const query = buildOverpassQuery(route, bufferKm * 1000);
  const cachePath = join(opts.cacheDir, 'overpass.json');
  const cached = readJson<OverpassCache>(cachePath);
  if (cached && cached.query === query) {
    log(`osm: ${cached.elements.length} elements from cache (${cached.fetchedAt})`);
    return cached.elements;
  }

  let lastError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      log(`osm: querying ${endpoint} (${(query.length / 1024).toFixed(0)} KB query)…`);
      const res = await fetchJson<OverpassResponse>(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
          body: `data=${encodeURIComponent(query)}`,
        },
        330_000
      );
      const cache: OverpassCache = { query, fetchedAt: new Date().toISOString(), endpoint, elements: res.elements };
      writeJson(cachePath, cache);
      log(`osm: ${res.elements.length} elements, cached at ${cachePath}`);
      return res.elements;
    } catch (err) {
      lastError = err;
      console.warn(`osm: ${endpoint} failed: ${(err as Error).message}`);
    }
  }
  return fail(`every Overpass endpoint failed; last error: ${(lastError as Error)?.message}`);
}

// ---------------------------------------------------------------------------
// Stage 2: Google Places (New)
// ---------------------------------------------------------------------------

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  addressComponents?: { longText?: string; types?: string[] }[];
  businessStatus?: string;
  dineIn?: boolean;
  reviews?: { text?: { text?: string }; originalText?: { text?: string } }[];
  photos?: { name: string }[];
}

/** One store's Google lookup, as cached under <cache-dir>/google/<docId>.json. */
interface GoogleLookup {
  fetchedAt: string;
  /** The place the text search returned, if any. */
  placeId: string | null;
  /** Whether that place passed the distance + chain check against the OSM store. */
  matched: boolean;
  place: GooglePlace | null;
  note: string;
}

class SpendGuard {
  readonly google: GoogleUsage = { textSearch: 0, placeDetails: 0, placePhotos: 0 };
  readonly claude: ClaudeUsage = { requests: 0, inputTokens: 0, outputTokens: 0 };

  constructor(readonly maxUsd: number) {}

  spentUsd(): number {
    return estimateGoogleSpend(this.google).listUsd + estimateClaudeSpend(this.claude);
  }

  /** True when a call costing `usd` at list price still fits under the cap. */
  canAfford(usd: number): boolean {
    return this.spentUsd() + usd <= this.maxUsd + 1e-9;
  }
}

const DETAILS_USD = GOOGLE_PRICING.placeDetailsEnterpriseAtmosphere.usdPer1000 / 1000;
const PHOTO_USD = GOOGLE_PRICING.placePhoto.usdPer1000 / 1000;
/** A generous per-store ceiling for the vision call, used only to project the photo stage. */
const CLAUDE_PER_STORE_USD_ESTIMATE = 0.05;

class GoogleClient {
  constructor(private readonly key: string, private readonly guard: SpendGuard) {}

  private headers(fieldMask: string): Record<string, string> {
    return { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': fieldMask };
  }

  /** Free (IDs Only SKU): the place id of the store, searched by name inside a tight box around it. */
  async findPlaceId(store: StoreCandidate): Promise<string | null> {
    const dLat = TEXT_SEARCH_BOX_METERS / 111_320;
    const dLng = dLat / Math.cos((store.lat * Math.PI) / 180);
    const queries = [store.name, store.brand ?? 'コンビニ'];
    for (const textQuery of queries) {
      this.guard.google.textSearch++;
      const res = await fetchJson<{ places?: { id: string }[] }>(
        `${PLACES_API}/places:searchText`,
        {
          method: 'POST',
          headers: this.headers('places.id'),
          body: JSON.stringify({
            textQuery,
            includedType: 'convenience_store',
            languageCode: 'ja',
            regionCode: 'JP',
            pageSize: 1,
            locationRestriction: {
              rectangle: {
                low: { latitude: store.lat - dLat, longitude: store.lng - dLng },
                high: { latitude: store.lat + dLat, longitude: store.lng + dLng },
              },
            },
          }),
        },
        60_000
      );
      const id = res.places?.[0]?.id;
      if (id) return id;
    }
    return null;
  }

  /** One Enterprise + Atmosphere request: everything stage 2 and 3 need about the place. */
  async placeDetails(placeId: string): Promise<GooglePlace> {
    this.guard.google.placeDetails++;
    return fetchJson<GooglePlace>(
      `${PLACES_API}/places/${encodeURIComponent(placeId)}?languageCode=ja&regionCode=JP`,
      { headers: this.headers(PLACE_DETAILS_FIELDS) },
      60_000
    );
  }

  /** The photo bytes (Place Photo SKU), following Google's redirect to the image. */
  async photo(name: string): Promise<{ data: Buffer; mediaType: string }> {
    this.guard.google.placePhotos++;
    const url = `${PLACES_API}/${name}/media?maxWidthPx=${PHOTO_MAX_WIDTH_PX}&key=${encodeURIComponent(this.key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching photo ${name}`);
    return {
      data: Buffer.from(await res.arrayBuffer()),
      mediaType: res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg',
    };
  }
}

async function lookupGoogle(
  store: StoreCandidate,
  google: GoogleClient,
  opts: Options
): Promise<GoogleLookup> {
  const cachePath = join(opts.cacheDir, 'google', `${store.docId}.json`);
  const cached = opts.refreshGoogle ? null : readJson<GoogleLookup>(cachePath);
  if (cached) return cached;

  const placeId = await google.findPlaceId(store);
  let lookup: GoogleLookup;
  if (!placeId) {
    lookup = { fetchedAt: new Date().toISOString(), placeId: null, matched: false, place: null, note: 'no place within the search box' };
  } else {
    const place = await google.placeDetails(placeId);
    const location = place.location
      ? { lat: place.location.latitude, lng: place.location.longitude }
      : null;
    const matched =
      location != null &&
      placeMatchesStore(location, store, {
        place: place.displayName ? konbiniBrandKey(place.displayName.text) : null,
        store: konbiniBrandKey(store.name) ?? (store.brand ? konbiniBrandKey(store.brand) : null),
      });
    lookup = {
      fetchedAt: new Date().toISOString(),
      placeId,
      matched,
      place,
      note: matched
        ? `matched ${place.displayName?.text ?? placeId}` +
          (location ? ` at ${Math.round(haversineMeters(location, store))} m` : '')
        : `rejected ${place.displayName?.text ?? placeId}: too far or a different chain`,
    };
  }
  writeJson(cachePath, lookup);
  return lookup;
}

function reviewTexts(place: GooglePlace): string[] {
  const texts = new Set<string>();
  for (const r of place.reviews ?? []) {
    for (const t of [r.text?.text, r.originalText?.text]) if (t?.trim()) texts.add(t.trim());
  }
  return [...texts];
}

// ---------------------------------------------------------------------------
// Stage 3: photos through a vision model
// ---------------------------------------------------------------------------

/** One store's photo verdicts, as cached under <cache-dir>/photos/<docId>.json. */
interface PhotoCache {
  fetchedAt: string;
  model: string;
  photoNames: string[];
  verdicts: PhotoVerdict[];
  /** Set when the model declined the request; the store stays unknown. */
  refused?: boolean;
}

const PHOTO_SYSTEM_PROMPT = `You classify photos of Japanese convenience stores (コンビニ) for a hiking guide. The question for each photo: does it show an INDOOR eat-in space (イートインスペース) inside the store, that is, a counter with stools or tables with chairs where customers sit down to eat, inside the shop?

Rules:
- "indoor": seating for customers is clearly visible inside the store.
- "outdoor": benches or tables outside the building only.
- "none": the photo shows the store (shelves, checkout, storefront, parking) and no customer seating is visible.
- "unclear": the photo does not let you tell (dark, cropped, unrelated, or a storefront whose interior you cannot see).
Be strict: a storefront seen from outside is "unclear" unless seating is plainly visible through the glass; a checkout counter, a hot-food counter or a staff area is not customer seating. A wrong "indoor" sends a hiker to a store with nowhere to sit, so answer "indoor" only when it is unambiguous, and put your honest probability in confidence.`;

const PHOTO_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    photos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: '1-based photo number as labelled' },
          seating: { type: 'string', enum: ['indoor', 'outdoor', 'none', 'unclear'] },
          confidence: { type: 'number', description: '0 to 1' },
          note: { type: 'string', description: 'one short phrase on what the photo shows' },
        },
        required: ['index', 'seating', 'confidence', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['photos'],
  additionalProperties: false,
} as const;

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

function isImageMediaType(s: string): s is ImageMediaType {
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(s);
}

async function judgePhotos(
  store: StoreCandidate,
  place: GooglePlace,
  google: GoogleClient,
  anthropic: Anthropic,
  guard: SpendGuard,
  opts: Options
): Promise<PhotoVerdict[] | null> {
  const names = (place.photos ?? []).slice(0, opts.maxPhotos).map((p) => p.name);
  if (names.length === 0) return [];
  const cachePath = join(opts.cacheDir, 'photos', `${store.docId}.json`);
  const cached = opts.refreshGoogle ? null : readJson<PhotoCache>(cachePath);
  if (cached && cached.photoNames.join('|') === names.join('|')) {
    return cached.refused ? null : cached.verdicts;
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  let index = 0;
  for (const name of names) {
    const { data, mediaType } = await google.photo(name);
    if (!isImageMediaType(mediaType)) continue;
    index++;
    content.push({ type: 'text', text: `Photo ${index}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: data.toString('base64') } });
  }
  if (index === 0) return [];
  content.push({
    type: 'text',
    text: `Store: ${store.name}. Classify each of the ${index} photo(s) above.`,
  });

  guard.claude.requests++;
  // Server-side fallback is on (fallbacks: "default"): if the safety
  // classifiers decline a request, the API retries it on the model Anthropic
  // recommends instead of returning a refusal.
  const response = await anthropic.beta.messages.create({
    model: CLAUDE_PRICING.model,
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: PHOTO_SYSTEM_PROMPT,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: PHOTO_OUTPUT_SCHEMA } },
    messages: [{ role: 'user', content }],
  });
  guard.claude.inputTokens += response.usage.input_tokens;
  guard.claude.outputTokens += response.usage.output_tokens;

  const cache: PhotoCache = {
    fetchedAt: new Date().toISOString(),
    model: response.model,
    photoNames: names,
    verdicts: [],
  };
  if (response.stop_reason === 'refusal') {
    cache.refused = true;
    writeJson(cachePath, cache);
    return null;
  }
  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  const parsed = JSON.parse(text) as { photos: (PhotoVerdict & { index: number; note: string })[] };
  cache.verdicts = parsed.photos
    .sort((a, b) => a.index - b.index)
    .map(({ seating, confidence }) => ({ seating, confidence: Math.max(0, Math.min(1, confidence)) }));
  writeJson(cachePath, cache);
  return cache.verdicts;
}

// ---------------------------------------------------------------------------
// Town
// ---------------------------------------------------------------------------

interface OnsenPoint {
  areaName: string;
  lat: number;
  lng: number;
}

async function loadOnsenPoints(): Promise<OnsenPoint[]> {
  try {
    const doc = await restGetDocument(`${COLLECTIONS.CATALOG_INDEX}/${CATALOG_INDEX_DOC_ID}`);
    const entries = JSON.parse(String(doc?.entries ?? '[]')) as CatalogIndexEntry[];
    return entries.map(([, , , areaName, , lat, lng]) => ({ areaName, lat, lng }));
  } catch (err) {
    console.warn(`catalog index unavailable, towns fall back to null: ${(err as Error).message}`);
    return [];
  }
}

function townFor(store: StoreCandidate, place: GooglePlace | null, onsens: OnsenPoint[]): string | null {
  const osmCity = store.tags['addr:city']?.trim();
  if (osmCity) return osmCity;
  const locality = place?.addressComponents?.find((c) => c.types?.includes('locality'))?.longText?.trim();
  if (locality) return locality;
  let best: OnsenPoint | null = null;
  let bestM = TOWN_FALLBACK_RADIUS_METERS;
  for (const o of onsens) {
    const m = haversineMeters(store, o);
    if (m < bestM) {
      best = o;
      bestM = m;
    }
  }
  return best ? `${best.areaName}周辺` : null;
}

// ---------------------------------------------------------------------------
// Firestore (admin)
// ---------------------------------------------------------------------------

interface KonbiniWrite extends Omit<KonbiniDocument, 'eatIn' | 'createdAt' | 'updatedAt'> {
  eatIn: Omit<EatInAssessment, 'checkedAt'> & { checkedAt: admin.firestore.Timestamp };
  createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
  updatedAt: admin.firestore.FieldValue;
}

function initAdmin(opts: Options): admin.firestore.Firestore | null {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (!opts.dryRun) fail('GOOGLE_APPLICATION_CREDENTIALS is not set (or pass --dry-run to write nothing)');
    log('firestore: no credentials; dry run reads nothing and writes nothing');
    return null;
  }
  admin.initializeApp({ projectId: PROJECT_ID });
  return admin.firestore();
}

async function loadExisting(db: admin.firestore.Firestore | null): Promise<Map<string, KonbiniDocument>> {
  const out = new Map<string, KonbiniDocument>();
  if (!db) return out;
  const snap = await db.collection(COLLECTIONS.KONBINI).get();
  for (const d of snap.docs) out.set(d.id, d.data() as KonbiniDocument);
  log(`firestore: ${out.size} existing /${COLLECTIONS.KONBINI} document(s)`);
  return out;
}

async function writeAll(db: admin.firestore.Firestore, docs: Map<string, KonbiniWrite>): Promise<void> {
  const entries = [...docs.entries()];
  const BATCH = 400;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = db.batch();
    for (const [id, data] of entries.slice(i, i + BATCH)) {
      batch.set(db.collection(COLLECTIONS.KONBINI).doc(id), data);
    }
    await batch.commit();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface StoreState {
  entry: StoreNearRoute;
  existing: KonbiniDocument | null;
  sources: EatInSource[];
  status: EatInStatus;
  confidence: number;
  googlePlaceId: string | null;
  place: GooglePlace | null;
}

function remerge(state: StoreState): void {
  const merged = mergeEvidence(state.sources);
  state.status = merged.status;
  state.confidence = merged.confidence;
}

function unresolved(states: StoreState[], limit: number | null): StoreState[] {
  const list = states.filter((s) => s.status === 'unknown');
  return limit == null ? list : list.slice(0, limit);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(opts.cacheDir, { recursive: true });
  const startedAt = new Date();
  const guard = new SpendGuard(opts.maxSpendUsd);
  const db = initAdmin(opts);

  // Route and inventory.
  const route = opts.gpx ? loadTrackFile(opts.gpx) : await loadFirestoreRoute(opts.routeId);
  log(`route: "${route.name}", ${route.points.length} points, buffer ${opts.bufferKm} km`);
  const elements = await loadOsm(route.points, opts.bufferKm, opts);
  const near = storesNearRoute(candidatesFromOsm(elements), route.points, opts.bufferKm);
  log(`stores: ${near.length} named convenience store(s) within ${opts.bufferKm} km of the route`);

  const existing = await loadExisting(db);
  const onsens = await loadOnsenPoints();

  // Stage 1: OSM tags, on top of whatever earlier runs recorded.
  const states: StoreState[] = near.map((entry) => {
    const prior = existing.get(entry.store.docId) ?? null;
    const priorSources = prior && !opts.refreshGoogle ? prior.eatIn.sources : [];
    const state: StoreState = {
      entry,
      existing: prior,
      sources: replaceSource(priorSources, 'osm_tags', osmTagEvidence(entry.store.tags)),
      status: 'unknown',
      confidence: 0,
      googlePlaceId: prior?.googlePlaceId ?? null,
      place: null,
    };
    remerge(state);
    return state;
  });
  log(`stage 1 (osm tags): ${countBy(states)}`);

  // Stage 2: Google Places for what is still unknown.
  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  let google: GoogleClient | null = null;
  let stoppedForSpend = false;
  if (opts.skipGoogle) {
    log('stage 2 (google): skipped (--skip-google)');
  } else if (!googleKey) {
    log('stage 2 (google): skipped, GOOGLE_MAPS_API_KEY is not set');
  } else {
    google = new GoogleClient(googleKey, guard);
    const todo = unresolved(states, opts.limit).filter(
      (s) => opts.refreshGoogle || s.existing?.googlePlaceId == null || !s.existing.eatIn.sources.some((x) => x.kind.startsWith('google'))
    );
    const projected = todo.length * DETAILS_USD;
    log(
      `stage 2 (google): ${todo.length} store(s) to look up; up to $${projected.toFixed(2)} at list price ` +
        `($0 within this month's free allowance of ${GOOGLE_PRICING.placeDetailsEnterpriseAtmosphere.freePerMonth} details)`
    );
    if (!guard.canAfford(projected)) {
      console.error(
        `stage 2 (google): NOT RUN, it could cost up to $${projected.toFixed(2)} at list price, over the ` +
          `--max-spend-usd ${opts.maxSpendUsd} cap. Re-run with a higher --max-spend-usd, or --limit to process part of the list.`
      );
      stoppedForSpend = true;
    }
    for (const state of stoppedForSpend ? [] : todo) {
      if (!guard.canAfford(DETAILS_USD)) {
        stoppedForSpend = true;
        break;
      }
      const lookup = await lookupGoogle(state.entry.store, google, opts);
      state.googlePlaceId = lookup.matched ? lookup.placeId : null;
      state.place = lookup.matched ? lookup.place : null;
      if (lookup.matched && lookup.place) {
        state.sources = replaceSource(state.sources, 'google_dine_in', dineInEvidence(lookup.place.dineIn));
        state.sources = replaceSource(state.sources, 'google_reviews', reviewEvidence(reviewTexts(lookup.place)));
        remerge(state);
      }
      log(`  ${state.entry.store.name}: ${lookup.note} → ${state.status}`);
    }
    log(`stage 2 (google): ${countBy(states)}${stoppedForSpend ? ' (stopped at the spend cap)' : ''}`);
  }

  // Stage 3: photos for what is still unknown and matched to a place with photos.
  if (opts.skipPhotos) {
    log('stage 3 (photos): skipped (--skip-photos)');
  } else if (!google) {
    log('stage 3 (photos): skipped, needs the Google stage');
  } else if (!process.env.ANTHROPIC_API_KEY) {
    log('stage 3 (photos): skipped, ANTHROPIC_API_KEY is not set');
  } else if (stoppedForSpend) {
    log('stage 3 (photos): skipped, the spend cap was reached in stage 2');
  } else {
    const anthropic = new Anthropic();
    const todo = unresolved(states, opts.limit).filter((s) => {
      if (!s.place) {
        // Re-hydrate from the cache for stores resolved by an earlier run.
        const cached = readJson<GoogleLookup>(join(opts.cacheDir, 'google', `${s.entry.store.docId}.json`));
        if (cached?.matched && cached.place) s.place = cached.place;
      }
      return (s.place?.photos?.length ?? 0) > 0;
    });
    const perStore = opts.maxPhotos * PHOTO_USD + CLAUDE_PER_STORE_USD_ESTIMATE;
    const projected = todo.length * perStore;
    log(
      `stage 3 (photos): ${todo.length} store(s) with photos; up to $${projected.toFixed(2)} ` +
        `(photos at list price plus a generous vision estimate of $${CLAUDE_PER_STORE_USD_ESTIMATE} per store)`
    );
    if (!guard.canAfford(projected)) {
      console.error(
        `stage 3 (photos): NOT RUN, it could cost up to $${projected.toFixed(2)}, over the --max-spend-usd ` +
          `${opts.maxSpendUsd} cap (spent so far at list price: $${guard.spentUsd().toFixed(2)}). ` +
          'Re-run with a higher --max-spend-usd, --limit, or --skip-photos.'
      );
      stoppedForSpend = true;
    }
    for (const state of stoppedForSpend ? [] : todo) {
      if (!guard.canAfford(perStore)) {
        stoppedForSpend = true;
        break;
      }
      const verdicts = await judgePhotos(state.entry.store, state.place!, google, anthropic, guard, opts);
      if (verdicts === null) {
        log(`  ${state.entry.store.name}: model declined; left unknown`);
        continue;
      }
      state.sources = replaceSource(state.sources, 'google_photos', photoEvidence(verdicts));
      remerge(state);
      log(`  ${state.entry.store.name}: ${verdicts.map((v) => `${v.seating}@${v.confidence.toFixed(2)}`).join(', ')} → ${state.status}`);
    }
    log(`stage 3 (photos): ${countBy(states)}${stoppedForSpend ? ' (stopped at the spend cap)' : ''}`);
  }

  // Write.
  const now = admin.firestore.Timestamp.now();
  const writes = new Map<string, KonbiniWrite>();
  for (const s of states) {
    const { store } = s.entry;
    writes.set(store.docId, {
      name: store.name,
      brand: store.brand,
      lat: store.lat,
      lng: store.lng,
      town: townFor(store, s.place, onsens) ?? s.existing?.town ?? null,
      osmId: store.osmId,
      googlePlaceId: s.googlePlaceId ?? s.existing?.googlePlaceId ?? null,
      routeOffsetKm: s.entry.routeOffsetKm,
      eatIn: { status: s.status, confidence: s.confidence, sources: s.sources, checkedAt: now },
      createdAt: (s.existing?.createdAt as admin.firestore.Timestamp | undefined) ?? admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  if (db && !opts.dryRun) {
    await writeAll(db, writes);
    log(`firestore: ${writes.size} document(s) written to /${COLLECTIONS.KONBINI}`);
  } else {
    log(`firestore: dry run, ${writes.size} document(s) would be written to /${COLLECTIONS.KONBINI}`);
  }

  // Report.
  const report = buildReport({ opts, route, states, writes, guard, startedAt, stoppedForSpend });
  mkdirSync(join(resolve(opts.report), '..'), { recursive: true });
  writeFileSync(opts.report, report);
  log('');
  log(report);
  log(`report written to ${opts.report}`);
  if (stoppedForSpend) {
    log(
      `\nThe --max-spend-usd ${opts.maxSpendUsd} cap held back part of the work; what was resolved ` +
        'has been written. Re-run with a higher cap to continue (cached lookups are free).'
    );
    process.exitCode = 2;
  }
}

function countBy(states: StoreState[]): string {
  const counts: Record<EatInStatus, number> = { yes: 0, likely: 0, no: 0, unknown: 0 };
  for (const s of states) counts[s.status]++;
  return `yes ${counts.yes}, likely ${counts.likely}, no ${counts.no}, unknown ${counts.unknown}`;
}

function buildReport(params: {
  opts: Options;
  route: Route;
  states: StoreState[];
  writes: Map<string, KonbiniWrite>;
  guard: SpendGuard;
  startedAt: Date;
  stoppedForSpend: boolean;
}): string {
  const { opts, route, states, writes, guard, startedAt, stoppedForSpend } = params;
  const counts: Record<EatInStatus, number> = { yes: 0, likely: 0, no: 0, unknown: 0 };
  for (const s of states) counts[s.status]++;
  const googleSpend = estimateGoogleSpend(guard.google);
  const claudeSpend = estimateClaudeSpend(guard.claude);
  const positives = states
    .filter((s) => s.status === 'yes' || s.status === 'likely')
    .sort((a, b) => (a.status === b.status ? b.confidence - a.confidence : a.status === 'yes' ? -1 : 1));

  const lines: string[] = [];
  lines.push('# Konbini eat-in report');
  lines.push('');
  lines.push(`Run: ${startedAt.toISOString()}${opts.dryRun ? ' (dry run, nothing written)' : ''}`);
  lines.push(`Route: ${route.name} (${route.points.length} points), buffer ${opts.bufferKm} km`);
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push(`Total stores: ${states.length}`);
  lines.push('');
  lines.push('| Status | Stores |');
  lines.push('| --- | ---: |');
  for (const status of ['yes', 'likely', 'no', 'unknown'] as const) lines.push(`| ${status} | ${counts[status]} |`);
  lines.push('');
  lines.push('## Estimated API cost (this run)');
  lines.push('');
  lines.push('| Service | Calls | List price | After free allowance |');
  lines.push('| --- | ---: | ---: | ---: |');
  lines.push(`| Google Text Search (IDs only) | ${guard.google.textSearch} | $0.00 | $0.00 |`);
  lines.push(`| Google Place Details (Enterprise + Atmosphere) | ${guard.google.placeDetails} | $${((guard.google.placeDetails * DETAILS_USD)).toFixed(2)} | see total |`);
  lines.push(`| Google Place Photo | ${guard.google.placePhotos} | $${(guard.google.placePhotos * PHOTO_USD).toFixed(2)} | see total |`);
  lines.push(`| Google total | | $${googleSpend.listUsd.toFixed(2)} | $${googleSpend.afterFreeTierUsd.toFixed(2)} |`);
  lines.push(`| Claude ${CLAUDE_PRICING.model} (${guard.claude.requests} requests, ${guard.claude.inputTokens} in / ${guard.claude.outputTokens} out tokens) | ${guard.claude.requests} | $${claudeSpend.toFixed(2)} | $${claudeSpend.toFixed(2)} |`);
  lines.push(`| **Total** | | **$${guard.spentUsd().toFixed(2)}** | **$${(googleSpend.afterFreeTierUsd + claudeSpend).toFixed(2)}** |`);
  lines.push('');
  lines.push(
    `Cap: $${opts.maxSpendUsd.toFixed(2)} at list price${stoppedForSpend ? ' (REACHED: some stores were not looked up)' : ''}. ` +
      'Cached lookups cost nothing on a re-run.'
  );
  lines.push('');
  lines.push(`## Eat-in stores (${positives.length})`);
  lines.push('');
  if (positives.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| # | Store | Town | Status | Confidence | Off route | Sources |');
    lines.push('| ---: | --- | --- | --- | ---: | ---: | --- |');
    positives.forEach((s, i) => {
      const w = writes.get(s.entry.store.docId)!;
      const sources = s.sources
        .filter((x) => x.verdict !== 'no')
        .map((x) => `${x.kind}: ${x.detail}`)
        .join('; ');
      lines.push(
        `| ${i + 1} | ${s.entry.store.name} | ${w.town ?? ''} | ${s.status} | ${s.confidence.toFixed(2)} | ${s.entry.routeOffsetKm.toFixed(1)} km | ${sources.replace(/\|/g, '/')} |`
      );
    });
  }
  lines.push('');
  const unknowns = states.filter((s) => s.status === 'unknown');
  lines.push(`## Still unknown (${unknowns.length})`);
  lines.push('');
  lines.push(unknowns.length === 0 ? 'None.' : unknowns.map((s) => s.entry.store.name).join(', '));
  lines.push('');
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
