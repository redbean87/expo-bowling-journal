import { useConvexAuth } from 'convex/react';
import { Redirect, Stack } from 'expo-router';

import { GameSaveQueueSyncer } from '@/providers/game-save-queue-syncer';

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <>
      <GameSaveQueueSyncer />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
