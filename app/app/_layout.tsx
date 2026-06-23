import { loadStoredLanguage } from '../src/i18n';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, KleeOne_600SemiBold } from '@expo-google-fonts/klee-one';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/theme';

// Keep the native splash visible until the brand font has loaded, so the
// 九八 mark never flashes in a fallback face.
SplashScreen.preventAutoHideAsync();

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

// Drives the native status-bar icons from the active theme. Lives inside the
// ThemeProvider so it sees scheme changes; the StatusBar style is the one bit
// of chrome that can't be expressed as a themed StyleSheet.
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
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
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider>
      <ThemedStatusBar />
      <AuthProvider>
        <NavigationController />
        <Stack screenOptions={{ headerShown: false, headerBackButtonDisplayMode: 'minimal' }}>
          <Stack.Screen
            name="onsens/edit-visit"
            options={{ presentation: 'modal', headerShown: true }}
          />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
