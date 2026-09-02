import React, { useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BrowserProvider, useBrowser } from '@/contexts/BrowserContext';
import { DialogProvider } from '@/contexts/DialogContext';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import colors from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';

// Keep the provider boundary stable without requiring a native module that is
// unavailable in the standard Expo Go client.
const KeyboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/**
 * Listens for URLs shared into the app from other apps (Android intent
 * filters) and opens them immediately in the in-app browser.
 */
function IncomingUrlHandler() {
  const { open } = useBrowser();

  useEffect(() => {
    // On web, Linking.getInitialURL() returns the page URL itself — skip to
    // avoid auto-opening the in-app browser with the dev server URL.
    if (Platform.OS === 'web') return;

    // URL that launched the app cold (app was not running).
    Linking.getInitialURL().then((url) => {
      if (url && /^https?:\/\//i.test(url)) open(url);
    }).catch(() => { /* ignore — no initial URL on cold start without an intent */ });

    // URL received while the app is already running (foreground / background).
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url && /^https?:\/\//i.test(url)) open(url);
    });

    return () => sub.remove();
  }, [open]);

  return null;
}

function RootLayoutNav() {
  const { user, loading } = useAuth();

  // Always reset to the home (chat) screen on every cold start.
  // Expo Router / React Navigation persists navigation state across sessions,
  // so if the account or settings sheet was open when the app was closed,
  // it would restore to that state on next open.
  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/' : '/account');
  }, [loading, user]);

  if (loading) return null;

  return (
    <>
      <IncomingUrlHandler />
      <Stack initialRouteName={user ? 'index' : 'account'} screenOptions={{ headerBackTitle: 'Back' }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="settings"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.85],
              sheetGrabberVisible: true,
              headerShown: false,
              contentStyle: { backgroundColor: colors.light.background },
            }}
          />
        </Stack.Protected>
        <Stack.Screen
          name="account"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6],
            sheetGrabberVisible: true,
            headerShown: false,
            contentStyle: { backgroundColor: colors.light.background },
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [interLoaded, interError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const fontsLoaded = interLoaded;
  const fontError = interError;

  useEffect(() => {
    // Hide splash as soon as fonts resolve, or after a 2 s safety timeout
    // so the web preview never shows a blank white screen.
    const timer = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 2000);
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
      clearTimeout(timer);
    }
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <BrowserProvider>
                <DialogProvider>
                  <StatusBar style="light" />
                  <RootLayoutNav />
                </DialogProvider>
              </BrowserProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
