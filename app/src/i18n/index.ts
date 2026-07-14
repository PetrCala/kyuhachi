import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './en';
import ja from './ja';

export const SUPPORTED_LANGUAGES = ['en', 'ja'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Each language is shown in its own script (endonym), like iOS Settings.
// These are intentionally not run through t(): a language's own name does
// not get translated.
export const LANGUAGES: { code: AppLanguage; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
];

const LANGUAGE_KEY = 'settings.language';

function deviceLanguage(): AppLanguage {
  return getLocales()[0]?.languageCode === 'ja' ? 'ja' : 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ja: { translation: ja },
  },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

/**
 * Apply the user's saved language preference, falling back to the device
 * language when none has been chosen. Call once before the UI renders so the
 * correct language is in effect on the first frame.
 */
export async function loadStoredLanguage(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if ((saved === 'en' || saved === 'ja') && saved !== i18n.language) {
      await i18n.changeLanguage(saved);
    }
  } catch {
    // Storage unavailable: keep the device language in effect.
  }
}

/** Change the active language and remember the choice across launches. */
export async function setAppLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language);
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Best-effort persistence; the in-memory change already took effect.
  }
}

export default i18n;
