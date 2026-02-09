import { useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import { convexJournalService } from '@/services/journal';

import type { CreateGameInput, SessionId } from '@/services/journal';

export function useGames(sessionId: SessionId | null) {
  const games = useQuery(
    convexJournalService.listGamesBySession,
    sessionId ? { sessionId } : 'skip'
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
    isLoading: sessionId !== null && games === undefined,
    createGame,
    isCreating,
  };
}
