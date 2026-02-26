import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient, useConvexAuth } from 'convex/react';
import { PropsWithChildren, useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { persistHasSignedInBefore } from '@/auth/prior-sign-in-storage';
import { tokenStorage } from '@/auth/token-storage';
import { PwaUpdateBanner } from '@/components/pwa-update-banner';
import { env } from '@/config/env';
import { PreferencesProvider } from '@/providers/preferences-provider';

const convex = new ConvexReactClient(env.convexUrl);

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <PreferencesProvider>
        <ConvexAuthProvider client={convex} storage={tokenStorage}>
          <SignInHistoryTracker />
          <PwaUpdateBanner />
          {children}
        </ConvexAuthProvider>
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}

function SignInHistoryTracker() {
  const { isAuthenticated } = useConvexAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void persistHasSignedInBefore();
  }, [isAuthenticated]);

  return null;
}
