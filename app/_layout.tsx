import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProvider } from '@/providers/app-provider';

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </AppProvider>
  );
}
