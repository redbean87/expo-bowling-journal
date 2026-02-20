import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import {
  convexJournalService,
  type CreateLeagueInput,
  type RemoveLeagueInput,
  type UpdateLeagueInput,
} from '@/services/journal';

export function useLeagues() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const leagues = useQuery(
    convexJournalService.listLeagues,
    isAuthenticated ? {} : 'skip'
  );
  const createLeagueMutation = useMutation(convexJournalService.createLeague);
  const updateLeagueMutation = useMutation(convexJournalService.updateLeague);
  const removeLeagueMutation = useMutation(convexJournalService.removeLeague);
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

  const updateLeague = useCallback(
    async (input: UpdateLeagueInput) => {
      return await updateLeagueMutation(input);
    },
    [updateLeagueMutation]
  );

  const removeLeague = useCallback(
    async (input: RemoveLeagueInput) => {
      return await removeLeagueMutation(input);
    },
    [removeLeagueMutation]
  );

  return {
    leagues: leagues ?? [],
    isLoading: isAuthLoading || (isAuthenticated && leagues === undefined),
    isAuthenticated,
    createLeague,
    updateLeague,
    removeLeague,
    isCreating,
  };
}
