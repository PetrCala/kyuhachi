import { loadStoredLanguage } from '../src/i18n';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, KleeOne_600SemiBold } from '@expo-google-fonts/klee-one';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { StampCelebrationProvider } from '@/context/StampCelebrationContext';
import { radii } from '@/theme';

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

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ KleeOne_600SemiBold });
  const [languageLoaded, setLanguageLoaded] = useState(false);

  // Apply the saved language preference before the first frame, so the UI
  // never flashes the device language when the user has chosen another.
  useEffect(() => {
    loadStoredLanguage().finally(() => setLanguageLoaded(true));
  }, []);

  const ready = fontsLoaded && languageLoaded;

  useEffect(() => {
    if (!ready) return;
    const elapsed = Date.now() - splashShownAt;
    const remaining = Math.max(0, MIN_SPLASH_DURATION_MS - elapsed);
    const timer = setTimeout(() => SplashScreen.hideAsync(), remaining);
    return () => clearTimeout(timer);
  }, [ready]);

  if (!ready) return null;

  return (
    <AuthProvider>
      <PreferencesProvider>
        <StampCelebrationProvider>
          <NavigationController />
          <Stack screenOptions={{ headerShown: false, headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen
              name="onsens/edit-visit"
              options={{ presentation: 'modal', headerShown: true }}
            />
            {/* Onsen map preview: a native iOS sheet at a single fixed detent, so
                it can't resize to its content. The lone detent also gives native
                swipe-to-dismiss from anywhere (dragging down dismisses when the
                content is scrolled to the top, scrolls otherwise). */}
            <Stack.Screen
              name="onsens/preview/[id]"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.55],
                sheetGrabberVisible: true,
                sheetCornerRadius: radii.xl,
                headerShown: false,
              }}
            />
          </Stack>
        </StampCelebrationProvider>
      </PreferencesProvider>
    </AuthProvider>
  );
}
