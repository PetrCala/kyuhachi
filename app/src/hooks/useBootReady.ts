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
 * to sign-in, which has nothing to fetch. Reads its own
 * `useActiveChallengeProgress` instance (the app already mounts one per screen);
 * a productionized version would lift that hook into a shared provider so the
 * splash gate and the home screen share a single set of listeners.
 */
export function useBootReady(): boolean {
  const { user, isLoading: authLoading } = useAuth();
  const { loading: challengeLoading } = useActiveChallengeProgress();

  if (authLoading) return false;
  if (!user) return true;
  return !challengeLoading;
}
