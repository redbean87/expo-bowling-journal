import { useConvexAuth } from 'convex/react';
import { Redirect, Stack } from 'expo-router';

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
