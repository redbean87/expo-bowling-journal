import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import {
  convexJournalService,
  type CreateGameInput,
  type SessionId,
} from '@/services/journal';

export function useGames(sessionId: SessionId | null) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const games = useQuery(
    convexJournalService.listGamesBySession,
    isAuthenticated && sessionId ? { sessionId } : 'skip'
  );
  const createGameMutation = useMutation(convexJournalService.createGame);
  const [isCreating, setIsCreating] = useState(false);

  const createGame = useCallback(
    async (input: CreateGameInput) => {
      setIsCreating(true);

      try {
        return await createGameMutation(input);
      } finally {
        setIsCreating(false);
      }
    },
    [createGameMutation]
  );

  return {
    games: games ?? [],
    isLoading:
      isAuthLoading ||
      (isAuthenticated && sessionId !== null && games === undefined),
    createGame,
    isCreating,
  };
}
