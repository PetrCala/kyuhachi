/**
 * Transport stats: the mix of modes used to reach eligible onsens, the
 * self-powered share, the count of "shortcut" visits (faster than the
 * challenge's baseMode), and a per-prefecture breakdown for stacked bars.
 *
 * Computed over eligible visits, matching how tier eligibility frames the
 * challenge. `shortcutCount` reuses `countShortcuts` from tier-eligibility so the
 * number here always agrees with the tier logic.
 */
import { TRANSPORT_MODES, type TransportMode } from '@kyuhachi/shared';
import { countShortcuts } from '@/lib/tier-eligibility';
import { UNREPORTED_TRANSPORT, type TransportBucket } from '@/lib/budget';
import { eligibleWithOnsen, percent, type DistributionBucket, type VisitEntry } from './shared';

/** Modes in canonical order, with the unreported bucket last. */
const TRANSPORT_ORDER: TransportBucket[] = [...TRANSPORT_MODES, UNREPORTED_TRANSPORT];

export interface TransportPrefectureRow {
  prefecture: string;
  /** Per-bucket counts in canonical order (modes then unreported). */
  byMode: DistributionBucket<TransportBucket>[];
  total: number;
}

export interface TransportResult {
  /** Mode mix incl. an `unreported` bucket, canonical order, zero buckets kept. */
  mix: DistributionBucket<TransportBucket>[];
  /** Eligible visits with a reported mode. */
  reportedCount: number;
  /** Eligible visits in total (the coverage denominator). */
  totalCount: number;
  /** Share reached on foot or by bicycle, of reported visits (0-100); null if none reported. */
  selfPoweredPercent: number | null;
  /** Eligible visits reached faster than baseMode (the tier "shortcuts"). */
  shortcutCount: number;
  /** Whether a baseMode is known (when not, shortcuts are not meaningful). */
  hasBaseMode: boolean;
  /** Per-prefecture mode split, busiest first. */
  byPrefecture: TransportPrefectureRow[];
}

export interface TransportInput {
  entries: VisitEntry[];
  baseMode: TransportMode | null;
}

function bucketOf(mode: TransportMode | null): TransportBucket {
  return mode ?? UNREPORTED_TRANSPORT;
}

export function computeTransport(input: TransportInput): TransportResult {
  const visited = eligibleWithOnsen(input.entries);
  const modes = visited.map((e) => e.visit.structuredData.transportMode);

  const mix = countBuckets(modes.map(bucketOf));
  const reportedCount = modes.filter((m) => m != null).length;
  const selfPowered = modes.filter((m) => m === 'foot' || m === 'bicycle').length;

  // Per-prefecture stacked split.
  const rows = new Map<string, Map<TransportBucket, number>>();
  for (const entry of visited) {
    const pref = entry.onsen!.prefecture;
    let row = rows.get(pref);
    if (!row) {
      row = new Map();
      rows.set(pref, row);
    }
    const bucket = bucketOf(entry.visit.structuredData.transportMode);
    row.set(bucket, (row.get(bucket) ?? 0) + 1);
  }
  const byPrefecture: TransportPrefectureRow[] = Array.from(rows.entries())
    .map(([prefecture, counts]) => {
      const byMode = TRANSPORT_ORDER.map((key) => ({ key, count: counts.get(key) ?? 0 }));
      const total = byMode.reduce((sum, b) => sum + b.count, 0);
      return { prefecture, byMode, total };
    })
    .sort((a, b) => b.total - a.total || a.prefecture.localeCompare(b.prefecture));

  return {
    mix,
    reportedCount,
    totalCount: visited.length,
    selfPoweredPercent: percent(selfPowered, reportedCount),
    shortcutCount: countShortcuts(modes, input.baseMode),
    hasBaseMode: input.baseMode != null,
    byPrefecture,
  };
}

/** Count already-bucketed values into the canonical order (zero buckets kept). */
function countBuckets(values: TransportBucket[]): DistributionBucket<TransportBucket>[] {
  const counts = new Map<TransportBucket, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return TRANSPORT_ORDER.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}
