import { loadStoredLanguage } from '../src/i18n';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, KleeOne_600SemiBold } from '@expo-google-fonts/klee-one';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { OnsenCatalogProvider } from '@/context/OnsenCatalogContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { StampCelebrationProvider } from '@/context/StampCelebrationContext';
import { RowActionsSheetProvider } from '@/components/RowActionsSheet';
import { useBootReady } from '@/hooks/useBootReady';

// Keep the native splash visible until the brand font has loaded, so the
// 九八 mark never flashes in a fallback face.
SplashScreen.preventAutoHideAsync();

// Fade the splash out rather than cutting it abruptly, so the 九八 mark
// dissolves into the first frame instead of vanishing.
SplashScreen.setOptions({ fade: true, duration: 300 });

// Floor on how briefly the splash may appear. The app loads fast, so without
// this the splash can flash by before the user registers it. Hold it for at
// least this long so the 九八 mark reads as intentional, not a glitch.
const MIN_SPLASH_DURATION_MS = 500;

// Ceiling on how long the splash may linger waiting for first data. Past this
// we lift it and let the in-app WordmarkLoader take over rather than freeze on
// a static, feedback-less splash. Matters on a slow or offline first launch
// where the challenge read stalls.
const SPLASH_MAX_WAIT_MS = 2500;

const splashShownAt = Date.now();

function NavigationController() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const onSignIn = segments[0] === 'sign-in';
    if (!user && !onSignIn) {
      router.replace('/sign-in');
    } else if (user && onSignIn) {
      router.replace('/');
    }
  }, [user, isLoading]);

  return null;
}

/**
 * Owns when the native splash lifts. Holds it until the local prerequisites
 * (brand font + saved language) are in place AND the first screen's data is
 * ready, so the app boots straight from the splash into content, with no
 * intermediate loading spinner on a normal launch. A cap (SPLASH_MAX_WAIT_MS)
 * bounds the wait so a stalled first fetch drops to the in-app loader instead
 * of freezing the splash. Renders nothing and unmounts once the splash is gone.
 */
function SplashGate({ localReady, onHidden }: { localReady: boolean; onHidden: () => void }) {
  const bootReady = useBootReady();
  const [capReached, setCapReached] = useState(false);

  useEffect(() => {
    const elapsed = Date.now() - splashShownAt;
    const timer = setTimeout(() => setCapReached(true), Math.max(0, SPLASH_MAX_WAIT_MS - elapsed));
    return () => clearTimeout(timer);
  }, []);

  // Latches true and never reverts (each input is monotonic), so this schedules
  // the hide exactly once and the timer is never cancelled out from under it.
  const shouldHide = localReady && (bootReady || capReached);

  useEffect(() => {
    if (!shouldHide) return;
    const elapsed = Date.now() - splashShownAt;
    const remaining = Math.max(0, MIN_SPLASH_DURATION_MS - elapsed);
    const timer = setTimeout(() => {
      void SplashScreen.hideAsync();
      onHidden();
    }, remaining);
    return () => clearTimeout(timer);
  }, [shouldHide, onHidden]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ KleeOne_600SemiBold });
  const [languageLoaded, setLanguageLoaded] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);

  // Apply the saved language preference before the first frame, so the UI
  // never flashes the device language when the user has chosen another.
  useEffect(() => {
    loadStoredLanguage().finally(() => setLanguageLoaded(true));
  }, []);

  const localReady = fontsLoaded && languageLoaded;
  const handleSplashHidden = useCallback(() => setSplashHidden(true), []);

  // Mount the provider tree immediately (even before the brand font and saved
  // language settle) so Firebase auth and the first Firestore reads start
  // under the splash rather than after it lifts. Everything below renders
  // hidden behind the native splash; SplashGate keeps the splash up until the
  // first screen's data is ready (see useBootReady), so the old post-splash
  // loading spinner never appears on a normal launch. Font/language only need
  // to be settled by the time the splash actually lifts, which SplashGate
  // enforces via `localReady`.
  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        <OnsenCatalogProvider>
          <PreferencesProvider>
            <StampCelebrationProvider>
              <RowActionsSheetProvider>
                {!splashHidden && (
                  <SplashGate localReady={localReady} onHidden={handleSplashHidden} />
                )}
                <NavigationController />
                <Stack screenOptions={{ headerShown: false, headerBackButtonDisplayMode: 'minimal' }}>
                  <Stack.Screen
                    name="onsens/edit-visit"
                    options={{ presentation: 'modal', headerShown: true }}
                  />
                </Stack>
              </RowActionsSheetProvider>
            </StampCelebrationProvider>
          </PreferencesProvider>
        </OnsenCatalogProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
