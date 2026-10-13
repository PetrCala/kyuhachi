import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

/** How long the "copied" confirmation stays up after a copy before it resets. */
export const COPIED_FEEDBACK_MS = 1600;

async function fireHaptic() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics are unavailable on some devices/simulators; non-fatal.
  }
}

/**
 * Copies text to the system pasteboard with the feedback a copy deserves: a
 * light haptic, a `copied` flag the caller shows for `COPIED_FEEDBACK_MS` (an
 * icon swapping to a checkmark, say), and a VoiceOver announcement of
 * `announcement`, since a glyph swap is invisible to a screen reader.
 *
 * Repeated copies restart the confirmation window instead of stacking timers.
 */
export function useCopyToClipboard(announcement: string) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );

  const copy = useCallback(
    async (text: string) => {
      await Clipboard.setStringAsync(text);
      void fireHaptic();
      AccessibilityInfo.announceForAccessibility(announcement);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => {
        resetTimer.current = null;
        setCopied(false);
      }, COPIED_FEEDBACK_MS);
    },
    [announcement]
  );

  return { copied, copy };
}
