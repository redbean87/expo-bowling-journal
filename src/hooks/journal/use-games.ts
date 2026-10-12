import { useMutation } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';

import { isConnectivityOffline } from '@/services/connectivity';
import {
  convexJournalService,
  type CreateGameInput,
  type GameListItem,
  type RemoveGameInput,
  type SessionId,
} from '@/services/journal';
import { listLocalGamesBySession } from '@/services/journal/local-reads';

export function useGames(sessionId: SessionId | null) {
  const [localGames, setLocalGames] = useState<GameListItem[] | null>(null);
  const [isLocalGamesLoading, setIsLocalGamesLoading] = useState(true);
  const createGameMutation = useMutation(convexJournalService.createGame);
  const removeGameMutation = useMutation(convexJournalService.removeGame);
  const [isCreating, setIsCreating] = useState(false);

  // Local SQLite is the authoritative game read: always loaded (when a
  // session is selected), no Convex query, no cloud cache, no auth gate.
  useEffect(() => {
    if (!sessionId) {
      setIsLocalGamesLoading(false);
      return;
    }

    let isMounted = true;

    const loadLocalGames = async () => {
      try {
        const localList = await listLocalGamesBySession(sessionId);

        if (isMounted) {
          setLocalGames(localList);
        }
      } catch {
        if (isMounted) {
          setLocalGames([]);
        }
      } finally {
        if (isMounted) {
          setIsLocalGamesLoading(false);
        }
      }
    };

    void loadLocalGames();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  // Offline (Phase 3): game create/remove are explicitly disabled while the
  // app is offline — no existing queue models a bare game create (the game
  // save queue belongs to the editor autosave flow) or a game delete. The
  // callbacks resolve null without invoking Convex, touching UI state, or
  // throwing.
  const createGame = useCallback(
    async (input: CreateGameInput) => {
      if (isConnectivityOffline()) {
        return null;
      }

      setIsCreating(true);

      try {
        return await createGameMutation(input);
      } finally {
        setIsCreating(false);
      }
    },
    [createGameMutation]
  );

  const removeGame = useCallback(
    async (input: RemoveGameInput) => {
      if (isConnectivityOffline()) {
        return null;
      }

      return await removeGameMutation(input);
    },
    [removeGameMutation]
  );

  return {
    games: localGames ?? [],
    isLoading: sessionId !== null && isLocalGamesLoading,
    createGame,
    removeGame,
    isCreating,
  };
}
