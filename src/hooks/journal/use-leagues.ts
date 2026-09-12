import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { resolveReferenceIdForMutation } from './reference-id-resolution';
import { useLeagueQueue } from './use-league-queue';

import {
  convexJournalService,
  type CreateLeagueInput,
  type League,
  type RemoveLeagueInput,
  type UpdateLeagueInput,
} from '@/services/journal';

const LEAGUE_CACHE_KEY = 'journal:leagues-cache:v1';

export function useLeagues() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const leagues = useQuery(
    convexJournalService.listLeagues,
    isAuthenticated ? {} : 'skip'
  );
  const [leagueCache, setLeagueCache] = useState<League[] | null>(null);
  const [isCacheLoading, setIsCacheLoading] = useState(true);

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
  const createLeagueMutation = useMutation(convexJournalService.createLeague);
  const updateLeagueMutation = useMutation(convexJournalService.updateLeague);
  const removeLeagueMutation = useMutation(convexJournalService.removeLeague);
  const [isCreating, setIsCreating] = useState(false);

  const createLeague = useCallback(
    async (input: CreateLeagueInput) => {
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
      return await removeLeagueMutation(input);
    },
    [removeLeagueMutation]
  );

  const { displayLeagues } = useLeagueQueue({
    leagues: leagues ?? leagueCache ?? [],
  });

  const mergedLeagues = useMemo(() => {
    if (!isAuthenticated) {
      return leagues ?? [];
    }

    return displayLeagues;
  }, [displayLeagues, isAuthenticated, leagues]);

  return {
    leagues: mergedLeagues,
    isLoading:
      isAuthLoading ||
      (isAuthenticated && leagues === undefined && isCacheLoading),
    isAuthenticated,
    createLeague,
    createOpenBowlingLeague,
    updateLeague,
    removeLeague,
    isCreating,
  };
}
