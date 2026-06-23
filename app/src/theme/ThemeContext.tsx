import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { themes, type ColorScheme, type ThemeColors } from './colors';

/**
 * Appearance theming. The provider follows the OS by default (`'system'`) and
 * lets the user pin light or dark. The choice is persisted, mirroring the
 * language preference in `src/i18n`.
 *
 * Consumers read `colors` from here (live, reacts to changes) and build their
 * stylesheets with `useThemedStyles` — never by importing the static `colors`
 * export, which is frozen at module load.
 */

export type ThemePreference = 'system' | ColorScheme;

const PREFERENCE_KEY = 'appearance.preference';

type ThemeContextValue = {
  /** The active palette — swap target for every themed style. */
  colors: ThemeColors;
  /** The resolved scheme after applying the preference over the OS setting. */
  scheme: ColorScheme;
  /** The user's stored choice (`'system'` defers to the OS). */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null, live from the OS
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // Load the stored preference once. Default 'system' already matches the OS,
  // so the only possible cold-start flash is for a user who pinned the theme
  // opposite to their device — acceptable; persist-before-first-frame can be
  // added later (see src/i18n/loadStoredLanguage for the pattern).
  useEffect(() => {
    AsyncStorage.getItem(PREFERENCE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setPreferenceState(saved);
      }
    });
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(PREFERENCE_KEY, next);
  };

  const scheme: ColorScheme =
    preference !== 'system' ? preference : systemScheme === 'dark' ? 'dark' : 'light';

  const value = useMemo<ThemeContextValue>(
    () => ({ colors: themes[scheme], scheme, preference, setPreference }),
    [scheme, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
