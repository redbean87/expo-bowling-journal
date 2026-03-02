import { useConvexAuth } from 'convex/react';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { AppProvider } from '@/providers/app-provider';
import { useAppTheme } from '@/theme/use-app-theme';

if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync();
}

export default function RootLayout() {
  return (
    <AppProvider>
      <RootStack />
    </AppProvider>
  );
}

function RootStack() {
  const { isLoading } = useConvexAuth();
  const { mode } = useAppTheme();

  useEffect(() => {
    if (Platform.OS === 'web' || isLoading) {
      return;
    }

    void SplashScreen.hideAsync();
  }, [isLoading]);

  useEffect(() => {
    if (Platform.OS !== 'web' || isLoading || typeof document === 'undefined') {
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
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
