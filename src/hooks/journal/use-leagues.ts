import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import {
  convexJournalService,
  type CreateLeagueInput,
} from '@/services/journal';

export function useLeagues() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const leagues = useQuery(
    convexJournalService.listLeagues,
    isAuthenticated ? {} : 'skip'
  );
  const createLeagueMutation = useMutation(convexJournalService.createLeague);
  const [isCreating, setIsCreating] = useState(false);

  const createLeague = useCallback(
    async (input: CreateLeagueInput) => {
      setIsCreating(true);

      try {
        return await createLeagueMutation(input);
      } finally {
        setIsCreating(false);
      }
    },
    [createLeagueMutation]
  );

  return {
    leagues: leagues ?? [],
    isLoading: isAuthLoading || (isAuthenticated && leagues === undefined),
    isAuthenticated,
    createLeague,
    isCreating,
  };
}
