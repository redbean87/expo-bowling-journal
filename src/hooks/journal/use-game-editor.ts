import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import {
  convexJournalService,
  type CreateGameInput,
  type GameId,
  type ReplaceFramesInput,
  type UpdateGameInput,
} from '@/services/journal';

export function useGameEditor(gameId: GameId | null) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const gameQuery = useQuery(
    convexJournalService.getGameById,
    isAuthenticated && gameId ? { gameId } : 'skip'
  );
  const framesQuery = useQuery(
    convexJournalService.listFramesByGame,
    isAuthenticated && gameId ? { gameId } : 'skip'
  );

  const createGameMutation = useMutation(convexJournalService.createGame);
  const updateGameMutation = useMutation(convexJournalService.updateGame);
  const replaceFramesMutation = useMutation(
    convexJournalService.replaceFramesForGame
  );

  const [isSaving, setIsSaving] = useState(false);

  const createGame = useCallback(
    async (input: CreateGameInput) => {
      setIsSaving(true);

      try {
        return await createGameMutation(input);
      } finally {
        setIsSaving(false);
      }
    },
    [createGameMutation]
  );

  const updateGame = useCallback(
    async (input: UpdateGameInput) => {
      setIsSaving(true);

      try {
        return await updateGameMutation(input);
      } finally {
        setIsSaving(false);
      }
    },
    [updateGameMutation]
  );

  const replaceFramesForGame = useCallback(
    async (input: ReplaceFramesInput) => {
      setIsSaving(true);

      try {
        return await replaceFramesMutation(input);
      } finally {
        setIsSaving(false);
      }
    },
    [replaceFramesMutation]
  );

  return {
    game: gameQuery ?? null,
    frames: framesQuery,
    isAuthenticated,
    isLoading:
      isAuthLoading ||
      (isAuthenticated &&
        gameId !== null &&
        (gameQuery === undefined || framesQuery === undefined)),
    createGame,
    updateGame,
    replaceFramesForGame,
    isSaving,
  };
}
