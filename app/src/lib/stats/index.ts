/**
 * Barrel for the statistics lib. A single import site for the pure compute
 * modules plus the existing budget model (re-exported so screens can pull
 * everything stats-related from `@/lib/stats`).
 */
export * from './shared';
export * from './progress';
export * from './geography';
export * from './timeline';
export * from './transport';
export * from './experience';
export * from './spend';
export * from '@/lib/budget';
