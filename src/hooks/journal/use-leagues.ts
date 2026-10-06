import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

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

const LEAGUE_CACHE_KEY = 'journal:leagues-cache:v1';

export function useLeagues() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const leagues = useQuery(
    convexJournalService.listLeagues,
    isAuthenticated ? {} : 'skip'
  );
  const [leagueCache, setLeagueCache] = useState<League[] | null>(null);
  const [isCacheLoading, setIsCacheLoading] = useState(true);
  const [localLeagues, setLocalLeagues] = useState<League[] | null>(null);
  const [isLocalLeaguesLoading, setIsLocalLeaguesLoading] = useState(true);

  useEffect(() => {
    const loadCache = async () => {
      try {
        const stored =
          Platform.OS === 'web'
            ? globalThis.localStorage.getItem(LEAGUE_CACHE_KEY)
            : await AsyncStorage.getItem(LEAGUE_CACHE_KEY);

        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setLeagueCache(parsed);
          }
        }
      } catch {
        // Ignore cache errors
      } finally {
        setIsCacheLoading(false);
      }
    };

    loadCache();
  }, []);

  useEffect(() => {
    if (leagues !== undefined) {
      const persistCache = async () => {
        try {
          const cacheData = JSON.stringify(leagues);
          if (Platform.OS === 'web') {
            globalThis.localStorage.setItem(LEAGUE_CACHE_KEY, cacheData);
          } else {
            await AsyncStorage.setItem(LEAGUE_CACHE_KEY, cacheData);
          }
        } catch {
          // Ignore persistence errors
        }
      };
      persistCache();
    }
  }, [leagues]);

  // Unauthenticated users read the locally persisted journal (local SQLite
  // is the authoritative source; the AsyncStorage cache above is cloud-only
  // and never used for local reads).
  useEffect(() => {
    if (isAuthenticated) {
      return;
    }

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
  }, [isAuthenticated]);

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
    leagues: leagues ?? leagueCache ?? [],
  });

  const mergedLeagues = useMemo(() => {
    if (!isAuthenticated) {
      return localLeagues ?? [];
    }

    return displayLeagues;
  }, [displayLeagues, isAuthenticated, localLeagues]);

  return {
    leagues: mergedLeagues,
    isLoading:
      isAuthLoading ||
      (isAuthenticated
        ? leagues === undefined && isCacheLoading
        : isLocalLeaguesLoading),
    isAuthenticated,
    createLeague,
    createOpenBowlingLeague,
    updateLeague,
    removeLeague,
    isCreating,
  };
}
