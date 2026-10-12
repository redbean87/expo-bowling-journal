import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient, useConvexAuth } from 'convex/react';
import { createContext, PropsWithChildren, useContext, useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { persistHasSignedInBefore } from '@/auth/prior-sign-in-storage';
import { tokenStorage } from '@/auth/token-storage';
import { PwaUpdateBanner } from '@/components/pwa-update-banner';
import { env } from '@/config/env';
import { PreferencesProvider } from '@/providers/preferences-provider';

/**
 * Local-first switch (C-0 of the offline conversion).
 *
 * Forced on for this phase: while it is on, the device journal is the
 * source of truth. The root does not wait on a session check, the auth
 * gate renders nothing (no sign-in form, no session-check UI), and the
 * journal hooks and sync path must not run Convex queries or mutations.
 * This constant is the single switch the conversion reads; the
 * `LocalModeContext` below makes it available to the provider tree.
 */
export const LOCAL_MODE_ENABLED = true;

type LocalModeContextValue = {
  localMode: boolean;
};

const localModeContextValue: LocalModeContextValue = {
  localMode: LOCAL_MODE_ENABLED,
};
const LocalModeContext = createContext<LocalModeContextValue>(
  localModeContextValue
);

/**
 * Reads the local-first switch inside the app provider tree. `true` means
 * the journal is running fully local: no session gate, no server auth
 * affordances, no Convex queries or mutations.
 */
export function useLocalMode(): boolean {
  const { localMode } = useContext(LocalModeContext);

  return localMode;
}

const convex = new ConvexReactClient(env.convexUrl);

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <LocalModeContext.Provider value={localModeContextValue}>
      <SafeAreaProvider>
        <PreferencesProvider>
          <ConvexAuthProvider client={convex} storage={tokenStorage}>
            <SignInHistoryTracker />
            <PwaUpdateBanner />
            {children}
          </ConvexAuthProvider>
        </PreferencesProvider>
      </SafeAreaProvider>
    </LocalModeContext.Provider>
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
