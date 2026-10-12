import { useConvexAuth, useMutation } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';

import { resolveReferenceIdForMutation } from './reference-id-resolution';
import { useLeagueQueue } from './use-league-queue';

import {
  createQueuedLeagueCreateEntry,
  createQueuedLeagueDeleteEntry,
  upsertQueuedJournalCreateEntry,
} from '@/screens/journal/journal-create-queue';
import {
  loadJournalCreateQueue,
  persistJournalCreateQueue,
} from '@/screens/journal/journal-create-queue-storage';
import { isConnectivityOffline } from '@/services/connectivity';
import {
  convexJournalService,
  type CreateLeagueInput,
  type League,
  type LeagueId,
  type RemoveLeagueInput,
  type UpdateLeagueInput,
} from '@/services/journal';
import { listLocalLeagues } from '@/services/journal/local-reads';
import { createClientSyncId } from '@/utils/client-sync-id';

export function useLeagues() {
  // `isAuthenticated` is reported for consumers that still branch on the
  // session (e.g. the game editor); the league read itself never waits on
  // it or the network.
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

  const createLeagueMutation = useMutation(convexJournalService.createLeague);
  const updateLeagueMutation = useMutation(convexJournalService.updateLeague);
  const removeLeagueMutation = useMutation(convexJournalService.removeLeague);
  const [isCreating, setIsCreating] = useState(false);

  const createLeague = useCallback(
    async (input: CreateLeagueInput) => {
      if (isConnectivityOffline()) {
        // Queue for the existing journal-create flusher (same entry type the
        // league screen's offline path uses) and return the local draft id so
        // the caller can still navigate to the pending league.
        const clientSyncId = input.clientSyncId ?? createClientSyncId('league');

        const queuedEntry = createQueuedLeagueCreateEntry(
          input,
          clientSyncId,
          Date.now()
        );
        const currentQueue = await loadJournalCreateQueue();
        const nextQueue = upsertQueuedJournalCreateEntry(
          currentQueue,
          queuedEntry
        );
        await persistJournalCreateQueue(nextQueue);

        return `draft-${clientSyncId}` as LeagueId;
      }

      setIsCreating(true);

      try {
        const resolvedHouseId = await resolveReferenceIdForMutation(
          'house',
          input.houseId ? String(input.houseId) : null
        );

        const { leagueType, ...rest } = input;

        return await createLeagueMutation({
          ...rest,
          houseId: (resolvedHouseId as never) ?? null,
          ...(leagueType !== undefined ? { type: leagueType } : {}),
        });
      } finally {
        setIsCreating(false);
      }
    },
    [createLeagueMutation]
  );

  const createOpenBowlingLeague = useCallback(async () => {
    setIsCreating(true);

    try {
      return await createLeagueMutation({
        name: 'Open Bowling',
        type: 'open',
      });
    } finally {
      setIsCreating(false);
    }
  }, [createLeagueMutation]);

  const updateLeague = useCallback(
    async (input: UpdateLeagueInput) => {
      const resolvedHouseId = await resolveReferenceIdForMutation(
        'house',
        input.houseId ? String(input.houseId) : null
      );

      const { leagueType, ...rest } = input;

      return await updateLeagueMutation({
        ...rest,
        houseId: (resolvedHouseId as never) ?? null,
        ...(leagueType !== undefined ? { type: leagueType } : {}),
      });
    },
    [updateLeagueMutation]
  );

  const removeLeague = useCallback(
    async (input: RemoveLeagueInput) => {
      if (isConnectivityOffline()) {
        const queuedEntry = createQueuedLeagueDeleteEntry(
          {
            leagueId: input.leagueId,
            leagueClientSyncId: null,
          },
          Date.now()
        );
        const currentQueue = await loadJournalCreateQueue();
        const nextQueue = upsertQueuedJournalCreateEntry(
          currentQueue,
          queuedEntry
        );
        await persistJournalCreateQueue(nextQueue);

        return null;
      }

      return await removeLeagueMutation(input);
    },
    [removeLeagueMutation]
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
