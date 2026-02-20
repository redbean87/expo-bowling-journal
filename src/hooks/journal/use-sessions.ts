import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import {
  convexJournalService,
  type CreateSessionInput,
  type LeagueId,
  type RemoveSessionInput,
  type UpdateSessionInput,
} from '@/services/journal';

export function useSessions(leagueId: LeagueId | null) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const sessions = useQuery(
    convexJournalService.listSessionsByLeague,
    isAuthenticated && leagueId ? { leagueId } : 'skip'
  );
  const createSessionMutation = useMutation(convexJournalService.createSession);
  const updateSessionMutation = useMutation(convexJournalService.updateSession);
  const removeSessionMutation = useMutation(convexJournalService.removeSession);
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

  const updateSession = useCallback(
    async (input: UpdateSessionInput) => {
      return await updateSessionMutation(input);
    },
    [updateSessionMutation]
  );

  const removeSession = useCallback(
    async (input: RemoveSessionInput) => {
      return await removeSessionMutation(input);
    },
    [removeSessionMutation]
  );

  return {
    sessions: sessions ?? [],
    isLoading:
      isAuthLoading ||
      (isAuthenticated && leagueId !== null && sessions === undefined),
    createSession,
    updateSession,
    removeSession,
    isCreating,
  };
}
