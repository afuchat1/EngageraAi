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
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import colors from '@/constants/colors';

// KeyboardProvider is native-only — on web it's a no-op wrapper
let KeyboardProvider: React.FC<{ children: React.ReactNode }>;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  KeyboardProvider = require('react-native-keyboard-controller').KeyboardProvider;
} else {
  KeyboardProvider = ({ children }) => <>{children}</>;
}

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
  return (
    <>
      <IncomingUrlHandler />
      <Stack screenOptions={{ headerBackTitle: 'Back' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
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
