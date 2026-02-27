import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import { resolveReferenceIdForMutation } from './reference-id-resolution';

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
        const [resolvedHouseId, resolvedPatternId, resolvedBallId] =
          await Promise.all([
            resolveReferenceIdForMutation(
              'house',
              input.houseId ? String(input.houseId) : null
            ),
            resolveReferenceIdForMutation(
              'pattern',
              input.patternId ? String(input.patternId) : null
            ),
            resolveReferenceIdForMutation(
              'ball',
              input.ballId ? String(input.ballId) : null
            ),
          ]);

        return await createSessionMutation({
          ...input,
          houseId: (resolvedHouseId as never) ?? null,
          patternId: (resolvedPatternId as never) ?? null,
          ballId: (resolvedBallId as never) ?? null,
        });
      } finally {
        setIsCreating(false);
      }
    },
    [createSessionMutation]
  );

  const updateSession = useCallback(
    async (input: UpdateSessionInput) => {
      const [resolvedHouseId, resolvedPatternId, resolvedBallId] =
        await Promise.all([
          resolveReferenceIdForMutation(
            'house',
            input.houseId ? String(input.houseId) : null
          ),
          resolveReferenceIdForMutation(
            'pattern',
            input.patternId ? String(input.patternId) : null
          ),
          resolveReferenceIdForMutation(
            'ball',
            input.ballId ? String(input.ballId) : null
          ),
        ]);

      return await updateSessionMutation({
        ...input,
        houseId: (resolvedHouseId as never) ?? null,
        patternId: (resolvedPatternId as never) ?? null,
        ballId: (resolvedBallId as never) ?? null,
      });
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
