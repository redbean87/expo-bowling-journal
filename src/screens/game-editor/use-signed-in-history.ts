import { useEffect, useState } from 'react';

import { loadHasSignedInBefore } from '@/auth/prior-sign-in-storage';

export function useSignedInHistory(isAuthenticated: boolean) {
  const [persistedHasSignedInBefore, setPersistedHasSignedInBefore] =
    useState(false);

  useEffect(() => {
    let isMounted = true;

    const hydrateSignInHistory = async () => {
      const hasSignedIn = await loadHasSignedInBefore();

      if (isMounted) {
        setPersistedHasSignedInBefore(hasSignedIn);
      }
    };

    void hydrateSignInHistory();

    return () => {
      isMounted = false;
    };
  }, []);

  return isAuthenticated || persistedHasSignedInBefore;
}
