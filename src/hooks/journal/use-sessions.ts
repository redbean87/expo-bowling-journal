import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { resolveReferenceIdForMutation } from './reference-id-resolution';

import {
  convexJournalService,
  type CreateSessionInput,
  type LeagueId,
  type RemoveSessionInput,
  type Session,
  type UpdateSessionInput,
} from '@/services/journal';

export function useSessions(leagueId: LeagueId | null) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const sessions = useQuery(
    convexJournalService.listSessionsByLeague,
    isAuthenticated && leagueId ? { leagueId } : 'skip'
  );
  const [sessionCache, setSessionCache] = useState<Session[] | null>(null);
  const [isCacheLoading, setIsCacheLoading] = useState(true);
  const createSessionMutation = useMutation(convexJournalService.createSession);
  const updateSessionMutation = useMutation(convexJournalService.updateSession);
  const removeSessionMutation = useMutation(convexJournalService.removeSession);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const loadCache = async () => {
      if (!leagueId) {
        setIsCacheLoading(false);
        return;
      }

      try {
        const cacheKey = `journal:sessions-cache:v1:${leagueId}`;
        const stored =
          Platform.OS === 'web'
            ? globalThis.localStorage.getItem(cacheKey)
            : await AsyncStorage.getItem(cacheKey);

        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setSessionCache(parsed);
          }
        }
      } catch {
        // Ignore cache errors
      } finally {
        setIsCacheLoading(false);
      }
    };

    loadCache();
  }, [leagueId]);

  useEffect(() => {
    if (sessions !== undefined && leagueId) {
      const persistCache = async () => {
        try {
          const cacheKey = `journal:sessions-cache:v1:${leagueId}`;
          const cacheData = JSON.stringify(sessions);
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
  }, [sessions, leagueId]);

  const createSession = useCallback(
    async (input: CreateSessionInput) => {
      setIsCreating(true);

      try {
        const [resolvedHouseId, resolvedPatternId, resolvedBallId] =
          await Promise.all([
            resolveReferenceIdForMutation(
              'house',
              input.houseId ? String(input.houseId) : null
            ),
            resolveReferenceIdForMutation(
              'pattern',
              input.patternId ? String(input.patternId) : null
            ),
            resolveReferenceIdForMutation(
              'ball',
              input.ballId ? String(input.ballId) : null
            ),
          ]);

        return await createSessionMutation({
          ...input,
          houseId: (resolvedHouseId as never) ?? null,
          patternId: (resolvedPatternId as never) ?? null,
          ballId: (resolvedBallId as never) ?? null,
        });
      } finally {
        setIsCreating(false);
      }
    },
    [createSessionMutation]
  );

  const updateSession = useCallback(
    async (input: UpdateSessionInput) => {
      const [resolvedHouseId, resolvedPatternId, resolvedBallId] =
        await Promise.all([
          resolveReferenceIdForMutation(
            'house',
            input.houseId ? String(input.houseId) : null
          ),
          resolveReferenceIdForMutation(
            'pattern',
            input.patternId ? String(input.patternId) : null
          ),
          resolveReferenceIdForMutation(
            'ball',
            input.ballId ? String(input.ballId) : null
          ),
        ]);

      return await updateSessionMutation({
        ...input,
        houseId: (resolvedHouseId as never) ?? null,
        patternId: (resolvedPatternId as never) ?? null,
        ballId: (resolvedBallId as never) ?? null,
      });
    },
    [updateSessionMutation]
  );

  const removeSession = useCallback(
    async (input: RemoveSessionInput) => {
      return await removeSessionMutation(input);
    },
    [removeSessionMutation]
  );

  return {
    sessions:
      isAuthenticated && sessions === undefined
        ? (sessionCache ?? [])
        : (sessions ?? []),
    isLoading:
      isAuthLoading ||
      (isAuthenticated &&
        leagueId !== null &&
        sessions === undefined &&
        isCacheLoading),
    createSession,
    updateSession,
    removeSession,
    isCreating,
  };
}
