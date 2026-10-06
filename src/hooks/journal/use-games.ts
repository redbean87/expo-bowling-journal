import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

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
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const games = useQuery(
    convexJournalService.listGamesBySession,
    isAuthenticated && sessionId ? { sessionId } : 'skip'
  );
  const [gameCache, setGameCache] = useState<GameListItem[] | null>(null);
  const [isCacheLoading, setIsCacheLoading] = useState(true);
  const [localGames, setLocalGames] = useState<GameListItem[] | null>(null);
  const [isLocalGamesLoading, setIsLocalGamesLoading] = useState(true);
  const createGameMutation = useMutation(convexJournalService.createGame);
  const removeGameMutation = useMutation(convexJournalService.removeGame);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const loadCache = async () => {
      if (!sessionId) {
        setIsCacheLoading(false);
        return;
      }

      try {
        const cacheKey = `journal:games-cache:v1:${sessionId}`;
        const stored =
          Platform.OS === 'web'
            ? globalThis.localStorage.getItem(cacheKey)
            : await AsyncStorage.getItem(cacheKey);

        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setGameCache(parsed);
          }
        }
      } catch {
        // Ignore cache errors
      } finally {
        setIsCacheLoading(false);
      }
    };

    loadCache();
  }, [sessionId]);

  useEffect(() => {
    if (games !== undefined && sessionId) {
      const persistCache = async () => {
        try {
          const cacheKey = `journal:games-cache:v1:${sessionId}`;
          const cacheData = JSON.stringify(games);
          if (Platform.OS === 'web') {
            globalThis.localStorage.setItem(cacheKey, cacheData);
          } else {
            await AsyncStorage.setItem(cacheKey, cacheData);
          }
        } catch {
          // Ignore persistence errors
        }
      };
      persistCache();
    }
  }, [games, sessionId]);

  // Unauthenticated users read the locally persisted journal (local SQLite
  // is the authoritative source; the AsyncStorage cache above is cloud-only
  // and never used for local reads).
  useEffect(() => {
    if (isAuthenticated || !sessionId) {
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
  }, [isAuthenticated, sessionId]);

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
    games: !isAuthenticated
      ? (localGames ?? [])
      : games === undefined
        ? (gameCache ?? [])
        : games,
    isLoading:
      isAuthLoading ||
      (isAuthenticated
        ? sessionId !== null && games === undefined && isCacheLoading
        : sessionId !== null && isLocalGamesLoading),
    createGame,
    removeGame,
    isCreating,
  };
}
