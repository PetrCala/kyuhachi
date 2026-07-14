/**
 * Shared primitives for the statistics lib.
 *
 * Every stats module (progress / geography / timeline / transport / experience)
 * consumes the same `VisitEntry[]` produced by {@link buildVisitEntries}, so the
 * one-time work of resolving a Firestore `Timestamp` to millis, joining the
 * onsen display info, and tagging eligibility happens here exactly once.
 *
 * Like `lib/budget.ts`, everything in the stats lib is pure arithmetic over
 * plain Maps/arrays: no Firestore, no hooks, no `Date.now()` (callers pass
 * `now` in), so it is fully testable and works offline.
 */
import type { VisitDocument } from '@kyuhachi/shared';

/**
 * The onsen fields the stats lib reads, keyed by kyuhachiId. Structurally a
 * subset of the hook's `OnsenDisplayInfo`, declared here so the lib stays
 * decoupled from the hook layer (same approach as `BudgetOnsenInfo`).
 */
export interface StatsOnsenInfo {
  name: string;
  areaName: string;
  prefecture: string;
  lat: number;
  lng: number;
  /** Adult walk-in fee in yen; null when no parseable fee. */
  adultFee: number | null;
}

/** One visit joined to its onsen + resolved timestamp, the unit every module reads. */
export interface VisitEntry {
  onsenId: string;
  visit: VisitDocument;
  /** Display info, or null when the onsen isn't eligible / hasn't loaded yet. */
  onsen: StatsOnsenInfo | null;
  /** `visitedAt` resolved to epoch millis (computed once). */
  visitedAtMs: number;
  /** Whether `onsenId` is in the challenge's frozen eligible pool. */
  eligible: boolean;
}

export interface BuildVisitEntriesInput {
  visits: ReadonlyMap<string, VisitDocument>;
  onsenMap: ReadonlyMap<string, StatsOnsenInfo>;
  eligibleOnsenIds: readonly string[];
}

/**
 * Join visits to their onsen info and eligibility, sorted ascending by visit
 * time (ties broken by onsenId for determinism). The single source the other
 * modules build on.
 */
export function buildVisitEntries(input: BuildVisitEntriesInput): VisitEntry[] {
  const eligibleSet = new Set(input.eligibleOnsenIds);
  const entries: VisitEntry[] = [];
  for (const [onsenId, visit] of input.visits) {
    entries.push({
      onsenId,
      visit,
      onsen: input.onsenMap.get(onsenId) ?? null,
      visitedAtMs: visit.visitedAt.toMillis(),
      eligible: eligibleSet.has(onsenId),
    });
  }
  entries.sort((a, b) => a.visitedAtMs - b.visitedAtMs || a.onsenId.localeCompare(b.onsenId));
  return entries;
}

/** Eligible visits whose onsen info has loaded: the basis for geo/transport breakdowns. */
export function eligibleWithOnsen(entries: VisitEntry[]): VisitEntry[] {
  return entries.filter((e) => e.eligible && e.onsen !== null);
}

// ---------------------------------------------------------------------------
// Coverage: opt-in visit fields are sparse, so every derived stat reports how
// many of the relevant visits actually carried the data behind it.
// ---------------------------------------------------------------------------

export interface Coverage {
  /** Visits that reported this field (non-null). */
  reported: number;
  /** Visits the stat could have drawn from. */
  total: number;
}

/** Coverage of a nullable field across `total` candidate visits. */
export function coverage<T>(values: (T | null)[]): Coverage {
  return { reported: values.filter((v) => v != null).length, total: values.length };
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

/** Arithmetic mean, or **null** for an empty set (so callers show "no data", not 0). */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Mean over the non-null entries only; null when none are reported. */
export function meanDefined(values: (number | null)[]): number | null {
  return mean(values.filter((v): v is number => v != null));
}

/** Percentage (0-100) of `count` out of `total`; null when `total` is 0. */
export function percent(count: number, total: number): number | null {
  if (total <= 0) return null;
  return (count / total) * 100;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in kilometres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Parse a user-entered water-temperature string (e.g. `"42°C"`, `"41.5 ℃"`,
 * `"42度"`) to a number of degrees Celsius. Returns null when there's no numeric
 * content or the value is outside a plausible onsen range (0-100°C), which keeps
 * typos out of the average.
 */
export function parseWaterTempC(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

// ---------------------------------------------------------------------------
// Distributions: bucket counts in a fixed canonical order, nulls dropped, zero
// buckets retained so chart axes stay stable.
// ---------------------------------------------------------------------------

export interface DistributionBucket<K extends string = string> {
  key: K;
  count: number;
}

/** Count `values` into `order`'s buckets (canonical order, zero buckets kept). */
export function distribution<K extends string>(
  values: (K | null | undefined)[],
  order: readonly K[]
): DistributionBucket<K>[] {
  const counts = new Map<K, number>();
  for (const value of values) {
    if (value == null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return order.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

export interface HistogramBucket {
  /** Rating value 1-10. */
  bucket: number;
  count: number;
}

/** Zero-filled 1-10 histogram of rating values (rounded; out-of-range dropped). */
export function ratingHistogram(values: (number | null)[]): HistogramBucket[] {
  const counts = new Array<number>(10).fill(0);
  for (const value of values) {
    if (value == null) continue;
    const bucket = Math.round(value);
    if (bucket >= 1 && bucket <= 10) counts[bucket - 1] += 1;
  }
  return counts.map((count, i) => ({ bucket: i + 1, count }));
}
