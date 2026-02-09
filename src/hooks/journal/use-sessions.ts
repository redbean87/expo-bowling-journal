import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import {
  convexJournalService,
  type CreateSessionInput,
  type LeagueId,
} from '@/services/journal';

export function useSessions(leagueId: LeagueId | null) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const sessions = useQuery(
    convexJournalService.listSessionsByLeague,
    isAuthenticated && leagueId ? { leagueId } : 'skip'
  );
  const createSessionMutation = useMutation(convexJournalService.createSession);
  const [isCreating, setIsCreating] = useState(false);

  const createSession = useCallback(
    async (input: CreateSessionInput) => {
      setIsCreating(true);

      try {
        return await createSessionMutation(input);
      } finally {
        setIsCreating(false);
      }
    },
    [createSessionMutation]
  );

  return {
    sessions: sessions ?? [],
    isLoading:
      isAuthLoading ||
      (isAuthenticated && leagueId !== null && sessions === undefined),
    createSession,
    isCreating,
  };
}
