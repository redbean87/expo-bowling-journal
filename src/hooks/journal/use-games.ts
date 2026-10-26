import { useCallback, useEffect, useState } from 'react';

import {
  type CreateGameInput,
  type GameListItem,
  type RemoveGameInput,
  type SessionId,
} from '@/services/journal';
import { listLocalGamesBySession } from '@/services/journal/local-reads';
import {
  createGame as localCreateGame,
  removeGame as localRemoveGame,
} from '@/services/journal/local-writes';

export function useGames(sessionId: SessionId | null) {
  const [localGames, setLocalGames] = useState<GameListItem[] | null>(null);
  const [isLocalGamesLoading, setIsLocalGamesLoading] = useState(true);
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

  // Local-first game writes (C-2): every game mutation goes straight to the
  // SQLite-backed local journal through the app-boundary write adapter
  // (`src/services/journal/local-writes.ts`), the write-side counterpart of
  // the `local-reads.ts` adapter this hook already uses for its read. There
  // is no Convex mutation, no offline-queue enqueue, and no connectivity
  // branch: local mode is the only mode (docs/local-first-architecture.md §1
  // and §3, UI → local service → SQLite), so a game create persists whether
  // or not the device has a network, and the legacy journal-create queue is
  // an implementation artifact that stays cloud-only (§2.7). Nothing here
  // reads or writes that queue storage, so entries already persisted in it
  // stay untouched.
  //
  // Create returns the persisted local UUID (no `draft-<clientSyncId>`
  // identifier exists in local mode), so callers route on the real id.
  // `clientSyncId` stays transport-only: the adapter drops it and never
  // stores it. The Convex reference-id mapping step is dropped too — local
  // ids need no server-side resolution, so the ids the caller supplies are
  // already the local ones.
  //
  // Delete is a real local delete, not the legacy silent null: it returns the
  // id it deleted, and its scope is the approved game scope — the game plus
  // its frames, never its session and never its league (the game's frames are
  // cleared first because the canonical foreign keys are enforced with NO
  // ACTION). An unknown game id stays a no-op, matching the local service.
  // Service validation, foreign-key integrity, transactions, and error
  // propagation are the service's and are passed through unchanged, so the
  // screen's existing delete error handling still sees the service's error.
  const createGame = useCallback(async (input: CreateGameInput) => {
    setIsCreating(true);

    try {
      return await localCreateGame(input);
    } finally {
      setIsCreating(false);
    }
  }, []);

  const removeGame = useCallback(
    async (input: RemoveGameInput) => await localRemoveGame(input),
    []
  );

  return {
    games: localGames ?? [],
    isLoading: sessionId !== null && isLocalGamesLoading,
    createGame,
    removeGame,
    isCreating,
  };
}
