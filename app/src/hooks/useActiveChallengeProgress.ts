/**
 * Screen-facing entry point for the active challenge's data. The state itself
 * lives in a single root-level provider (see ActiveChallengeContext) so every
 * screen reads one resolved copy instead of opening its own listener chain and
 * painting a provisional, visit-less first frame.
 */
export {
  useActiveChallengeProgress,
  type ActiveChallengeProgress,
  type OnsenDisplayInfo,
  type OnsenRow,
} from '@/context/ActiveChallengeContext';
