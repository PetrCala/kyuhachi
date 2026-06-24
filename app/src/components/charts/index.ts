/** Reusable, dumb stat charts. Math lives in `lib/stats`; colors come from the theme. */
export { HorizontalBars, type BarItem } from './HorizontalBars';
export { CoverageBar, type CoverageItem } from './CoverageBar';
export { RatingHistogram } from './RatingHistogram';
export { LineChart, type LinePoint } from './LineChart';
export { DonutChart, type DonutSegment } from './DonutChart';
export { StackedBars, type StackedRow, type StackSegment } from './StackedBars';
export { ChartLegend, type LegendItem } from './ChartLegend';
export { CHART_SERIES, seriesColor, transportColor, TRANSPORT_BUCKET_ORDER } from './series';
