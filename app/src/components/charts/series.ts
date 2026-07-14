/**
 * Categorical colors for the Stats charts. A fixed series ramp plus stable
 * per-category maps so a transport mode (or season) keeps the same color across
 * every screen it appears on. All values come from the theme; never literals.
 */
import { TRANSPORT_MODES, type TransportMode } from '@kyuhachi/shared';
import { UNREPORTED_TRANSPORT, type TransportBucket } from '@/lib/budget';
import { colors } from '@/theme';

/** The categorical ramp, indexed for arbitrary series (e.g. seasons, companions). */
export const CHART_SERIES = [
  colors.chart1,
  colors.chart2,
  colors.chart3,
  colors.chart4,
  colors.chart5,
  colors.chart6,
] as const;

/** Color for series index `i`, cycling through the ramp. */
export function seriesColor(i: number): string {
  return CHART_SERIES[i % CHART_SERIES.length];
}

/** Fixed color per transport bucket: foot→green … car→rust, unreported→neutral. */
const TRANSPORT_COLORS: Record<TransportBucket, string> = {
  foot: colors.chart1,
  bicycle: colors.chart2,
  public: colors.chart3,
  car: colors.chart4,
  [UNREPORTED_TRANSPORT]: colors.chartNeutral,
};

export function transportColor(bucket: TransportBucket): string {
  return TRANSPORT_COLORS[bucket];
}

/** Transport buckets in canonical order (modes then unreported): display order. */
export const TRANSPORT_BUCKET_ORDER: TransportBucket[] = [...TRANSPORT_MODES, UNREPORTED_TRANSPORT];
