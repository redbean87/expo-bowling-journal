import { useConvexAuth } from 'convex/react';
import { Redirect, Stack } from 'expo-router';

import { GameSaveQueueSyncer } from '@/providers/game-save-queue-syncer';
import { useAppTheme } from '@/theme/use-app-theme';

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { colors } = useAppTheme();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <>
      <GameSaveQueueSyncer />
      <Stack
        screenOptions={{ contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}
