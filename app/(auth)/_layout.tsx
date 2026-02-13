import { useConvexAuth } from 'convex/react';
import { Redirect, Stack } from 'expo-router';

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Redirect href="/home" />;
  }

  return (
    <Stack>
      <Stack.Screen
        name="sign-in"
        options={{
          title: 'Sign in',
          headerTitleAlign: 'center',
        }}
      />
    </Stack>
  );
}
