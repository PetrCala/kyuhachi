/**
 * Test fixtures for the stats lib. Lives under `__fixtures__/` (not `__tests__/`)
 * so jest's default testMatch doesn't treat it as a suite.
 */
import {
  EMPTY_VISIT_STRUCTURED_DATA,
  type Timestamp,
  type VisitDocument,
  type VisitStructuredData,
} from '@kyuhachi/shared';
import type { StatsOnsenInfo } from '../shared';

/** A minimal Firestore `Timestamp` over an epoch-millis instant. */
export function ts(ms: number): Timestamp {
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1e6,
    toDate: () => new Date(ms),
    toMillis: () => ms,
  };
}

/** A `VisitDocument` seeded from the empty structured-data baseline. */
export function visit(opts: {
  visitedAtMs: number;
  photoUrls?: string[];
  notes?: string | null;
  data?: Partial<VisitStructuredData>;
}): VisitDocument {
  return {
    visitedAt: ts(opts.visitedAtMs),
    notes: opts.notes ?? null,
    photoUrls: opts.photoUrls ?? [],
    structuredData: { ...EMPTY_VISIT_STRUCTURED_DATA, ...opts.data },
    createdAt: ts(opts.visitedAtMs),
    updatedAt: ts(opts.visitedAtMs),
  };
}

/** A `StatsOnsenInfo` with sensible defaults. */
export function onsen(overrides: Partial<StatsOnsenInfo> = {}): StatsOnsenInfo {
  return {
    name: 'Onsen',
    areaName: 'Area',
    prefecture: '大分県',
    lat: 33,
    lng: 131,
    adultFee: null,
    ...overrides,
  };
}

/** Build a visits Map keyed by onsenId from `[id, VisitDocument]` pairs. */
export function visitsMap(entries: [string, VisitDocument][]): Map<string, VisitDocument> {
  return new Map(entries);
}

/** Build an onsen-info Map keyed by onsenId. */
export function onsenMap(entries: Record<string, StatsOnsenInfo>): Map<string, StatsOnsenInfo> {
  return new Map(Object.entries(entries));
}

/** Days as millis, for readable timestamps in tests. */
export function days(n: number): number {
  return n * 86_400_000;
}
