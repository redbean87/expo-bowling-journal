import { useMutation } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';

import { resolveReferenceIdForMutation } from './reference-id-resolution';

import {
  createQueuedSessionCreateEntry,
  createQueuedSessionDeleteEntry,
  upsertQueuedJournalCreateEntry,
} from '@/screens/journal/journal-create-queue';
import {
  loadJournalCreateQueue,
  persistJournalCreateQueue,
} from '@/screens/journal/journal-create-queue-storage';
import { isConnectivityOffline } from '@/services/connectivity';
import {
  convexJournalService,
  type CreateSessionInput,
  type LeagueId,
  type RemoveSessionInput,
  type Session,
  type SessionId,
  type UpdateSessionInput,
} from '@/services/journal';
import { listLocalSessionsByLeague } from '@/services/journal/local-reads';
import { createClientSyncId } from '@/utils/client-sync-id';

export function useSessions(leagueId: LeagueId | null) {
  const [localSessions, setLocalSessions] = useState<Session[] | null>(null);
  const [isLocalSessionsLoading, setIsLocalSessionsLoading] = useState(true);
  const createSessionMutation = useMutation(convexJournalService.createSession);
  const updateSessionMutation = useMutation(convexJournalService.updateSession);
  const removeSessionMutation = useMutation(convexJournalService.removeSession);
  const [isCreating, setIsCreating] = useState(false);

  // Local SQLite is the authoritative session read: always loaded (when a
  // league is selected), no Convex query, no cloud cache, no auth gate.
  useEffect(() => {
    if (!leagueId) {
      setIsLocalSessionsLoading(false);
      return;
    }

    let isMounted = true;

    const loadLocalSessions = async () => {
      try {
        const localList = await listLocalSessionsByLeague(leagueId);

        if (isMounted) {
          setLocalSessions(localList);
        }
      } catch {
        if (isMounted) {
          setLocalSessions([]);
        }
      } finally {
        if (isMounted) {
          setIsLocalSessionsLoading(false);
        }
      }
    };

    void loadLocalSessions();

    return () => {
      isMounted = false;
    };
  }, [leagueId]);

  const createSession = useCallback(
    async (input: CreateSessionInput) => {
      if (isConnectivityOffline()) {
        // Queue for the existing journal-create flusher (same entry type the
        // session offline path uses) and return the local draft id so the
        // caller can still navigate to the pending session. The hook cannot
        // know a draft league's client id, so it stays null; the flusher
        // falls back to payload.leagueId.
        const clientSyncId =
          input.clientSyncId ?? createClientSyncId('session');

        const queuedEntry = createQueuedSessionCreateEntry(
          input,
          clientSyncId,
          null,
          Date.now()
        );
        const currentQueue = await loadJournalCreateQueue();
        const nextQueue = upsertQueuedJournalCreateEntry(
          currentQueue,
          queuedEntry
        );
        await persistJournalCreateQueue(nextQueue);

        return `draft-${clientSyncId}` as SessionId;
      }

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
      if (isConnectivityOffline()) {
        const queuedEntry = createQueuedSessionDeleteEntry(
          {
            sessionId: input.sessionId,
            sessionClientSyncId: null,
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

      return await removeSessionMutation(input);
    },
    [removeSessionMutation]
  );

  return {
    sessions: localSessions ?? [],
    isLoading: leagueId !== null && isLocalSessionsLoading,
    createSession,
    updateSession,
    removeSession,
    isCreating,
  };
}
