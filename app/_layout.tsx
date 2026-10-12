import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { useConvexAuth } from 'convex/react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { ErrorBoundary } from '@/components/error-boundary';
import { AppProvider, useLocalMode } from '@/providers/app-provider';
import { useAppTheme } from '@/theme/use-app-theme';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync();
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <RootStack />
      </AppProvider>
    </ErrorBoundary>
  );
}

function RootStack() {
  const localMode = useLocalMode();
  const { isLoading } = useConvexAuth();
  const { mode, colors } = useAppTheme();

  // Local-first: the session check is not a gate between launch and the
  // journal. While local mode is on the root renders the journal
  // immediately and the session state may settle in the background; the
  // gate below only applies when local mode is off.
  const sessionGateActive = !localMode && isLoading;

  useEffect(() => {
    if (Platform.OS === 'web' || sessionGateActive) {
      return;
    }

    void SplashScreen.hideAsync();
  }, [sessionGateActive]);

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      sessionGateActive ||
      typeof document === 'undefined'
    ) {
      return;
    }

    const bootShell = document.getElementById('app-boot-shell');

    if (!bootShell) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      bootShell.style.opacity = '0';
      window.setTimeout(() => {
        bootShell.remove();
      }, 140);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [sessionGateActive]);

  if (sessionGateActive) {
    return null;
  }

  const baseNavTheme = mode === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseNavTheme,
    colors: {
      ...baseNavTheme.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surfaceSubtle,
      text: colors.textPrimary,
      border: colors.borderStrong,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen
          name="(auth)"
          options={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen
          name="(app)"
          options={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
