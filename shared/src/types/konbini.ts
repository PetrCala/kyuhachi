import type { Timestamp } from "./firestore"

// ---------------------------------------------------------------------------
// Convenience stores along the planned route, with an eat-in assessment
// ---------------------------------------------------------------------------

/**
 * Whether a convenience store has an eat-in space (イートインスペース).
 *
 *  - `yes`      direct evidence: an OSM seating tag, Google's dine-in flag, or
 *               a review that names the eat-in space.
 *  - `likely`   indirect evidence only: a vision model saw counter or table
 *               seating in the store's photos.
 *  - `no`       explicit negative evidence (e.g. `indoor_seating=no`). Kept so a
 *               re-run does not spend paid lookups on a store already answered.
 *  - `unknown`  nothing found either way.
 *
 * The app shows a badge for `yes` and `likely` only; `no` and `unknown` render
 * the same (no badge). A false positive is worse than a miss, so the batch job
 * biases toward precision: see `functions/src/util/konbini-eat-in.ts`.
 */
export const EAT_IN_STATUSES = ["yes", "likely", "unknown", "no"] as const

export type EatInStatus = (typeof EAT_IN_STATUSES)[number]

/** Where one piece of eat-in evidence came from. */
export type EatInSourceKind =
  | "osm_tags"
  | "google_dine_in"
  | "google_reviews"
  | "google_photos"

/** One piece of evidence the batch job recorded for a store. */
export interface EatInSource {
  kind: EatInSourceKind
  /** What this source alone concludes. */
  verdict: "yes" | "likely" | "no"
  /** Human-readable detail: the OSM tag, the matched review phrase, or the photo verdict. */
  detail: string
}

export interface EatInAssessment {
  status: EatInStatus
  /** 0 to 1. Always 0 for `unknown`. */
  confidence: number
  /** Every source consulted that said something, positive or negative. */
  sources: EatInSource[]
  /** When the batch job last evaluated this store. */
  checkedAt: Timestamp
}

/**
 * /konbini/{konbiniId}
 *
 * One document per convenience store within the search buffer of the planned
 * route, written by the one-off batch job (scripts/konbini-eat-in.ts) with admin
 * credentials. Never written by the app or Functions.
 *
 * The finder does not read this collection to list stores: stores still come
 * live from Apple Maps. It reads it only to decorate those live results with an
 * eat-in badge, matching by proximity and brand (app/src/lib/eat-in.ts), because
 * Apple results carry no stable id to join on.
 *
 * Document ID: `osm-<type>-<id>`, e.g. `osm-node-123456`, so a re-run upserts the
 * same document and never duplicates a store.
 */
export interface KonbiniDocument {
  /** Display name from OpenStreetMap, Japanese, shown as-is. */
  name: string
  /** OSM `brand` tag when present (e.g. "セブン-イレブン"), else null. */
  brand: string | null
  lat: number
  lng: number
  /** Municipality, best effort: OSM address, else Google's locality, else the nearest onsen's area. */
  town: string | null
  /** OSM element reference, "node/123" or "way/456". */
  osmId: string
  /** Google Places id, once the batch job has matched the store; null until then. */
  googlePlaceId: string | null
  /** Perpendicular distance from the planned route in km, as of the last run. */
  routeOffsetKm: number
  eatIn: EatInAssessment
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** The app shows the eat-in badge for these statuses only. */
export function showsEatInBadge(status: EatInStatus): boolean {
  return status === "yes" || status === "likely"
}

/**
 * The convenience-store chain a name belongs to, as a stable key, or null when
 * the name names no known chain. Both the batch job (matching an OSM store to a
 * Google place) and the app (matching an Apple Maps result to a /konbini
 * document) join on position first and use this as the tie-breaker, because
 * two chains often sit across one intersection and a position-only match
 * would badge the wrong one. Patterns cover the katakana, Latin and common
 * abbreviated spellings each chain appears under in the three sources.
 *
 * Normalisation folds width and case and drops spaces, hyphens and the
 * middle dot, so "セブン-イレブン", "セブン・イレブン" and "7-Eleven" all
 * read the same. The katakana long-vowel mark (ー) is kept: it is part of
 * the spelling of ローソン and ファミリーマート, not a separator.
 */
export function konbiniBrandKey(name: string): string | null {
  const n = name.normalize("NFKC").toLowerCase().replace(/[\s\-‐‑–—・]/g, "")
  for (const [key, pattern] of KONBINI_BRANDS) {
    if (pattern.test(n)) return key
  }
  return null
}

const KONBINI_BRANDS: readonly [string, RegExp][] = [
  ["seven_eleven", /セブン|7eleven|seveneleven|7イレブン|7-?11/],
  ["lawson", /ローソン|lawson/],
  ["family_mart", /ファミリーマート|ファミマ|familymart/],
  ["ministop", /ミニストップ|ministop/],
  ["daily_yamazaki", /デイリーヤマザキ|dailyyamazaki/],
  ["yamazaki_shop", /ヤマザキショップ|ヤマザキ|yshop|yamazaki/],
  ["poplar", /ポプラ|poplar/],
  ["seicomart", /セイコーマート|seicomart/],
  ["newdays", /ニューデイズ|newdays/],
  ["everyone", /エブリワン|everyone/],
  ["rickys", /リッキーズ|ricky/],
  ["aeon", /まいばすけっと|イオン|aeon/],
]
