import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePreferences } from '@/context/PreferencesContext';
import { StampClaimModal, type StampReward } from '@/components/StampClaimModal';

// The edit-visit screen is presented as a modal; recording a visit dismisses it.
// We let that slide-away finish before presenting the celebration so the stamp's
// entrance lands on a settled screen instead of fighting the dismissal.
const REVEAL_DELAY_MS = 420;

interface StampCelebrationContextValue {
  /**
   * Show the stamp-collection celebration for a just-recorded visit. Safe to
   * call right before navigating away from the editor — the reveal is deferred
   * until the editor's dismissal settles.
   */
  celebrateStamp: (reward: StampReward) => void;
}

const StampCelebrationContext = createContext<StampCelebrationContextValue>({
  celebrateStamp: () => {},
});

/**
 * Holds the pending stamp celebration and renders the claim modal above the whole
 * app, so the reward lands wherever the user is sent after saving — back to the
 * onsen page or all the way home. Sits under PreferencesProvider so it can honor
 * the stamp-animation toggle.
 */
export function StampCelebrationProvider({ children }: { children: React.ReactNode }) {
  const { animateStampCollect } = usePreferences();
  const [reward, setReward] = useState<StampReward | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const celebrateStamp = useCallback((next: StampReward) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setReward(next), REVEAL_DELAY_MS);
  }, []);

  return (
    <StampCelebrationContext.Provider value={{ celebrateStamp }}>
      {children}
      <StampClaimModal
        reward={reward}
        animationsEnabled={animateStampCollect}
        onDismiss={() => setReward(null)}
      />
    </StampCelebrationContext.Provider>
  );
}

export function useStampCelebration(): StampCelebrationContextValue {
  return useContext(StampCelebrationContext);
}
