import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { tokenStorage } from '@/auth/token-storage';
import { env } from '@/config/env';

const convex = new ConvexReactClient(env.convexUrl);

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <ConvexAuthProvider client={convex} storage={tokenStorage}>
        {children}
      </ConvexAuthProvider>
    </SafeAreaProvider>
  );
}
