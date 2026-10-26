import { useConvexAuth } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';

import { useLeagueQueue } from './use-league-queue';

import {
  type CreateLeagueInput,
  type League,
  type RemoveLeagueInput,
  type UpdateLeagueInput,
} from '@/services/journal';
import { listLocalLeagues } from '@/services/journal/local-reads';
import {
  createLeague as localCreateLeague,
  removeLeague as localRemoveLeague,
  updateLeague as localUpdateLeague,
} from '@/services/journal/local-writes';

export function useLeagues() {
  // `isAuthenticated` is reported for consumers that still branch on the
  // session (e.g. the game editor); the league reads and writes never wait
  // on it or the network.
  const { isAuthenticated } = useConvexAuth();

  const [localLeagues, setLocalLeagues] = useState<League[] | null>(null);
  const [isLocalLeaguesLoading, setIsLocalLeaguesLoading] = useState(true);

  // Local SQLite is the authoritative league read: always loaded, no Convex
  // query, no cloud cache, no auth gate.
  useEffect(() => {
    let isMounted = true;

    const loadLocalLeagues = async () => {
      try {
        const localList = await listLocalLeagues();

        if (isMounted) {
          setLocalLeagues(localList);
        }
      } catch {
        if (isMounted) {
          setLocalLeagues([]);
        }
      } finally {
        if (isMounted) {
          setIsLocalLeaguesLoading(false);
        }
      }
    };

    void loadLocalLeagues();

    return () => {
      isMounted = false;
    };
  }, []);

  const [isCreating, setIsCreating] = useState(false);

  // Local-first league writes (C-2): every league mutation goes straight to
  // the SQLite-backed local journal through the app-boundary write adapter
  // (`src/services/journal/local-writes.ts`), which mirrors the read-side
  // `local-reads.ts` adapters this hook already uses. There is no Convex
  // mutation, no offline-queue enqueue, and no connectivity branch: local
  // mode is the only mode (docs/local-first-architecture.md §1 and §3, UI →
  // local service → SQLite), and the legacy journal-create queue is an
  // implementation artifact that stays cloud-only (§2.7). Nothing here reads
  // or writes that queue storage, so entries already persisted in it stay
  // untouched.
  //
  // Create returns the persisted local UUID (no `draft-<clientSyncId>`
  // identifier exists in local mode), so callers route on the real id.
  // `clientSyncId` and `leagueType` stay transport-only: the adapter drops
  // them and never stores them. Service validation, foreign-key behavior
  // (a league that still has sessions rejects on delete — nothing cascades),
  // and error propagation are the service's and are passed through
  // unchanged.
  const createLeague = useCallback(async (input: CreateLeagueInput) => {
    setIsCreating(true);

    try {
      return await localCreateLeague(input);
    } finally {
      setIsCreating(false);
    }
  }, []);

  const createOpenBowlingLeague = useCallback(async () => {
    setIsCreating(true);

    try {
      return await localCreateLeague({ name: 'Open Bowling' });
    } finally {
      setIsCreating(false);
    }
  }, []);

  const updateLeague = useCallback(
    async (input: UpdateLeagueInput) => await localUpdateLeague(input),
    []
  );

  const removeLeague = useCallback(
    async (input: RemoveLeagueInput) => await localRemoveLeague(input),
    []
  );

  const { displayLeagues } = useLeagueQueue({
    leagues: localLeagues ?? [],
  });

  return {
    leagues: displayLeagues,
    isLoading: isLocalLeaguesLoading,
    isAuthenticated,
    createLeague,
    createOpenBowlingLeague,
    updateLeague,
    removeLeague,
    isCreating,
  };
}
