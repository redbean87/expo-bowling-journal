import { useConvexAuth } from 'convex/react';
import { Redirect } from 'expo-router';

export default function IndexScreen() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Redirect href="/home" />;
  }

  return <Redirect href="/sign-in" />;
}
