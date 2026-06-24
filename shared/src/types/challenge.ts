import type { Timestamp } from "./firestore"

// ---------------------------------------------------------------------------
// Challenge types (admin-managed, read-only for users)
// ---------------------------------------------------------------------------

export type TierConditionType =
  | "minVisits"
  | "maxFasterVisits"
  | "maxCalendarDays"

export interface TierCondition {
  type: TierConditionType
  value: number
}

export interface Tier {
  /** "gold" | "silver" | "bronze" */
  id: string
  name: string
  /** Human-readable summary for the rules screen */
  conditionSummary: string
  /** Machine-readable conditions for eligibility display */
  conditions: TierCondition[]
}

/**
 * /challenge_types/{typeId}
 *
 * Admin-managed. Never written by users.
 * Exact tier thresholds are TBD — do not hardcode them in app code.
 */
export interface ChallengeTypeDocument {
  name: string
  description: string
  /** kyuhachiIds of all eligible onsens (~155) */
  eligibleOnsenIds: string[]
  /** Number of eligible onsens required to complete the challenge (88) */
  completionCount: number
  /**
   * The challenge's intended transport ceiling. A visit reaching an onsen by a
   * faster mode than this (later in TRANSPORT_MODES) is a "shortcut", counted by
   * `maxFasterVisits` tier conditions. e.g. "foot" for walk-only, "car" for the
   * unrestricted challenge (where nothing is faster, so there are no shortcuts).
   */
  baseMode: TransportMode
  /** Ordered best → worst */
  tiers: Tier[]
  /** Prose rules for display on the challenge rules screen */
  rules: string[]
  isActive: boolean
}

// ---------------------------------------------------------------------------
// User challenges
// ---------------------------------------------------------------------------

/**
 * /users/{userId}/challenges/{challengeId}
 *
 * snapshotEligibleOnsenIds is frozen at creation and never mutated.
 * visitCount is NOT stored here — derive it client-side by counting visits
 * where onsenId ∈ snapshotEligibleOnsenIds.
 */
export interface ChallengeDocument {
  typeId: string
  name: string
  startDate: Timestamp
  isDefault: boolean
  /** Frozen snapshot of eligibleOnsenIds at the time this challenge was created */
  snapshotEligibleOnsenIds: string[]
  snapshotCatalogVersion: number
  /**
   * Optional reference to the imported route the user is currently following.
   * Cosmetic only — challenge completion ignores this field.
   * User can change this freely.
   */
  activeRouteId: string | null
  /**
   * The tier the user has **claimed** ("gold" | "silver" | "bronze"), or null.
   * A tier is never auto-earned: it becomes earned only when the user explicitly
   * claims it via the `claimTier` callable, which re-verifies eligibility and is
   * the sole writer (the client may never write this field — Firestore rules
   * enforce it). Created as null; once claimed it is a permanent trophy and the
   * visit triggers never change it.
   */
  earnedTier: string | null
  /**
   * When the current `earnedTier` was claimed. Written by the `claimTier`
   * callable alongside `earnedTier` (server-only, like it); updated on each
   * upgrade so it always reflects the current tier. Null until a tier is claimed.
   */
  earnedTierAt: Timestamp | null
  /** Set by onVisitCreated Function when unique eligible visits >= completionCount */
  completedAt: Timestamp | null
  createdAt: Timestamp
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

/**
 * How the user reached an onsen, self-reported. Ordered slowest → fastest:
 * `foot` < `bicycle` < `public` < `car`. Each challenge type declares a
 * `baseMode`; a visit using a faster mode than that base is a "shortcut".
 */
export const TRANSPORT_MODES = ["foot", "bicycle", "public", "car"] as const

export type TransportMode = (typeof TRANSPORT_MODES)[number]

/**
 * True if `mode` is faster (ranked later in TRANSPORT_MODES) than `base`.
 * A null mode (unreported) is never counted as a shortcut.
 */
export function isFasterThan(mode: TransportMode | null, base: TransportMode): boolean {
  if (mode == null) return false
  return TRANSPORT_MODES.indexOf(mode) > TRANSPORT_MODES.indexOf(base)
}

/** Perceived water heat, self-reported. Ordered cool → hot. */
export const PERCEIVED_HEAT_LEVELS = ["tooCool", "pleasant", "hot", "veryHot"] as const

export type PerceivedHeat = (typeof PERCEIVED_HEAT_LEVELS)[number]

/** How busy the onsen felt, self-reported. Ordered empty → crowded. */
export const CROWD_LEVELS = ["empty", "quiet", "moderate", "busy", "crowded"] as const

export type CrowdLevel = (typeof CROWD_LEVELS)[number]

/** Who the user visited with, self-reported. */
export const VISITED_WITH_OPTIONS = [
  "alone",
  "friend",
  "group",
  "family",
  "partner",
  "other",
] as const

export type VisitedWith = (typeof VISITED_WITH_OPTIONS)[number]

/**
 * Structured, self-reported details for a single visit. Every field is optional
 * (null = not reported). The recording UI splits these into a small "base" set
 * (always shown) and a larger "detailed" set (behind a Show-details toggle), but
 * they are stored flat here. All ratings are on a 1–10 scale.
 */
export interface VisitStructuredData {
  // — Base —
  /** Overall satisfaction, 1–10 */
  rating: number | null
  /**
   * How the user reached this onsen. Self-reported; null = not reported.
   * Used for tier eligibility display and (future) transport-restricted
   * challenge types.
   */
  transportMode: TransportMode | null
  /** Whether the user would return — doubles as a "favorite" flag */
  wouldReturn: boolean | null

  // — Detailed: ratings & impressions (all 1–10) —
  /** Overall cleanliness (bath + changing room, merged) */
  cleanlinessRating: number | null
  /** Atmosphere / ambience, including the view */
  atmosphereRating: number | null
  /** How distinctive / unique the onsen felt */
  uniquenessRating: number | null
  /** How easy it was to cool down between baths/saunas */
  coolDownRating: number | null
  /** Strength of the water's smell (e.g. sulfur, iron) */
  smellIntensityRating: number | null
  /** Value for money */
  valueRating: number | null

  // — Detailed: bath & facilities —
  /** Perceived water heat */
  perceivedHeat: PerceivedHeat | null
  /** User-entered string e.g. "42°C" */
  waterTemp: string | null
  saunaUsed: boolean | null
  saunaRating: number | null
  restAreaUsed: boolean | null
  restAreaRating: number | null
  foodUsed: boolean | null
  foodRating: number | null
  hadSoap: boolean | null
  massageChairAvailable: boolean | null

  // — Detailed: visit & company —
  /** Minutes spent at the onsen */
  duration: number | null
  crowdLevel: CrowdLevel | null
  visitedWith: VisitedWith | null
  interactedWithLocals: boolean | null
  /** How pleasant the local interaction was, 1–10 */
  localInteractionRating: number | null
}

/**
 * An all-unreported structured-data record. The single source of truth for a
 * freshly-recorded visit and the seed for edit forms, so the field set lives in
 * exactly one place. Spread it (`{ ...EMPTY_VISIT_STRUCTURED_DATA }`) rather than
 * sharing the reference.
 */
export const EMPTY_VISIT_STRUCTURED_DATA: VisitStructuredData = {
  rating: null,
  transportMode: null,
  wouldReturn: null,
  cleanlinessRating: null,
  atmosphereRating: null,
  uniquenessRating: null,
  coolDownRating: null,
  smellIntensityRating: null,
  valueRating: null,
  perceivedHeat: null,
  waterTemp: null,
  saunaUsed: null,
  saunaRating: null,
  restAreaUsed: null,
  restAreaRating: null,
  foodUsed: null,
  foodRating: null,
  hadSoap: null,
  massageChairAvailable: null,
  duration: null,
  crowdLevel: null,
  visitedWith: null,
  interactedWithLocals: null,
  localInteractionRating: null,
}

/**
 * /users/{userId}/challenges/{challengeId}/visits/{onsenId}
 *
 * Document ID IS the kyuhachiId — deduplication is structural.
 * Writing a second visit to the same onsen in the same challenge overwrites the first.
 * There is no separate visitId; the onsenId serves as the unique key per challenge.
 */
export interface VisitDocument {
  visitedAt: Timestamp
  notes: string | null
  /** Firebase Storage download URLs, in upload order. Capped at 6 in the UI. */
  photoUrls: string[]
  structuredData: VisitStructuredData
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * /users/{userId}/routes/{routeId}
 *
 * An externally-authored GPS track the user imports from a .gpx/.kml/.tcx file.
 * Routes are NOT built in-app and are NOT lists of onsens. On import the file is
 * parsed to a simplified coordinate track plus metadata; the raw file is not kept
 * (re-import to change a route).
 *
 * Independent from challenges. A challenge may reference a route via activeRouteId,
 * but completion logic ignores it entirely.
 */
export interface RouteDocument {
  name: string
  sourceFormat: "gpx" | "kml" | "tcx"
  /** Ordered, simplified track points. */
  points: { lat: number; lng: number }[]
  pointCount: number
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }
  distanceMeters: number | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
