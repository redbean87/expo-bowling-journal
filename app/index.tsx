import { useConvexAuth } from 'convex/react';
import { Redirect } from 'expo-router';

export default function IndexScreen() {
  const { isLoading } = useConvexAuth();

  if (isLoading) {
    return null;
  }

  return <Redirect href="/home" />;
}
