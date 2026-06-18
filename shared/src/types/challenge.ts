import type { Timestamp } from "./firestore"

// ---------------------------------------------------------------------------
// Challenge types (admin-managed, read-only for users)
// ---------------------------------------------------------------------------

export type TierConditionType =
  | "minVisits"
  | "maxTransportUses"
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
   * Optional reference to the route plan the user is currently following.
   * Cosmetic only — challenge completion ignores this field.
   * User can change this freely.
   */
  activePlanId: string | null
  /** Set by user at completion (self-reported) */
  claimedTier: string | null
  /** Set by onVisitCreated Function when unique eligible visits >= completionCount */
  completedAt: Timestamp | null
  createdAt: Timestamp
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

/**
 * How the user reached an onsen, self-reported. Ordered by permissiveness:
 * `foot` (most restrictive) → `car` (least). `foot` and `bicycle` are
 * non-motorized; `public` and `car` are motorized.
 */
export const TRANSPORT_MODES = ["foot", "bicycle", "public", "car"] as const

export type TransportMode = (typeof TRANSPORT_MODES)[number]

/** Whether a transport mode counts as motorized (for `maxTransportUses` tiers). */
export function isMotorizedTransport(mode: TransportMode | null): boolean {
  return mode === "public" || mode === "car"
}

export interface VisitStructuredData {
  /** 1–5 star rating */
  rating: number | null
  /** User-entered string e.g. "42°C" */
  waterTemp: string | null
  /** Minutes spent at the onsen */
  duration: number | null
  /**
   * How the user reached this onsen. Self-reported; null = not reported.
   * Used for tier eligibility display and (future) transport-restricted
   * challenge types.
   */
  transportMode: TransportMode | null
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
  /** Firebase Storage URL */
  photoUrl: string | null
  structuredData: VisitStructuredData
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ---------------------------------------------------------------------------
// Route plans
// ---------------------------------------------------------------------------

/**
 * /users/{userId}/route_plans/{planId}
 *
 * Independent from challenges. A challenge may reference a plan via activePlanId,
 * but completion logic ignores it entirely.
 */
export interface RoutePlanDocument {
  name: string
  /** Ordered list of kyuhachiIds */
  onsenIds: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
}
