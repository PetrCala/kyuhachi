import { useAuth } from '@/context/AuthContext';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';

/**
 * True once the app has resolved enough to paint its first real screen, so the
 * boot splash can stay up until then instead of handing off to an in-app
 * spinner. Mirrors what the home screen's loader waits on:
 *
 *  - auth must settle (cached credential resolved), and
 *  - when signed in, the active challenge's data (challenge → visits) must load.
 *
 * A signed-out launch is "ready" the moment auth settles: it redirects straight
 * to sign-in, which has nothing to fetch. The challenge data comes from the
 * root ActiveChallengeProvider, so holding the splash here also means every
 * screen below it opens with that data already resolved.
 */
export function useBootReady(): boolean {
  const { user, isLoading: authLoading } = useAuth();
  const { loading: challengeLoading } = useActiveChallengeProgress();

  if (authLoading) return false;
  if (!user) return true;
  return !challengeLoading;
}
