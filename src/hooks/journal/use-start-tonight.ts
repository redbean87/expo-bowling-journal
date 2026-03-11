import { useEffect, useRef } from 'react';

import type { DisplaySession } from '@/hooks/journal/use-session-queue';
import type { LeagueId, SessionId } from '@/services/journal';
import type { Router } from 'expo-router';

import {
  createQueuedSessionCreateEntry,
  upsertQueuedJournalCreateEntry,
} from '@/screens/journal/journal-create-queue';
import {
  loadJournalCreateQueue,
  persistJournalCreateQueue,
} from '@/screens/journal/journal-create-queue-storage';
import { buildJournalGamesRouteParams } from '@/screens/journal/journal-route-params';
import { formatIsoDateForToday } from '@/screens/journal-fast-lane-utils';
import { createClientSyncId } from '@/utils/client-sync-id';

type UseStartTonightParams = {
  isFocused: boolean;
  startTonight: boolean;
  leagueId: LeagueId | null;
  rawLeagueId: string | null;
  leagueClientSyncId: string | null;
  isSessionsLoading: boolean;
  isCreatingSession: boolean;
  displaySessions: DisplaySession[];
  createSession: (input: {
    leagueId: LeagueId;
    date: string;
  }) => Promise<SessionId>;
  refreshQueuedSessionCreates: () => Promise<void>;
  router: Router;
  onError: (message: string) => void;
};

export function useStartTonight({
  isFocused,
  startTonight,
  leagueId,
  rawLeagueId,
  leagueClientSyncId,
  isSessionsLoading,
  isCreatingSession,
  displaySessions,
  createSession,
  refreshQueuedSessionCreates,
  router,
  onError,
}: UseStartTonightParams) {
  const hasHandledStartTonightRef = useRef(false);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (!startTonight || hasHandledStartTonightRef.current) {
      return;
    }

    const targetLeagueRouteId = leagueId ?? rawLeagueId;

    if (!targetLeagueRouteId || isSessionsLoading || isCreatingSession) {
      return;
    }

    hasHandledStartTonightRef.current = true;
    const today = formatIsoDateForToday();
    const existingDisplaySession = displaySessions.find(
      (session) => session.date === today
    );

    if (existingDisplaySession) {
      const targetSessionRouteId =
        existingDisplaySession.sessionId ??
        `draft-${existingDisplaySession.clientSyncId ?? 'session'}`;

      router.replace({
        pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
        params: buildJournalGamesRouteParams({
          leagueId: targetLeagueRouteId,
          sessionId: targetSessionRouteId,
          leagueClientSyncId,
          sessionClientSyncId: existingDisplaySession.clientSyncId,
          sessionDate: today,
          sessionWeekNumber: existingDisplaySession.weekNumber,
          startEntry: true,
        }) as never,
      } as never);
      return;
    }

    if (!leagueId && leagueClientSyncId) {
      void (async () => {
        const clientSyncId = createClientSyncId('session');
        const queuedEntry = createQueuedSessionCreateEntry(
          {
            leagueId: null as never,
            date: today,
          },
          clientSyncId,
          leagueClientSyncId,
          Date.now()
        );
        const currentQueue = await loadJournalCreateQueue();
        const nextQueue = upsertQueuedJournalCreateEntry(
          currentQueue,
          queuedEntry
        );
        await persistJournalCreateQueue(nextQueue);
        await refreshQueuedSessionCreates();

        router.replace({
          pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
          params: buildJournalGamesRouteParams({
            leagueId: targetLeagueRouteId,
            sessionId: `draft-${clientSyncId}`,
            leagueClientSyncId,
            sessionClientSyncId: clientSyncId,
            sessionDate: today,
          }) as never,
        } as never);
      })();

      return;
    }

    if (!leagueId) {
      return;
    }

    void (async () => {
      try {
        const sessionId = await createSession({
          leagueId,
          date: today,
        });
        router.replace({
          pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
          params: buildJournalGamesRouteParams({
            leagueId: targetLeagueRouteId,
            sessionId,
            leagueClientSyncId,
            sessionDate: today,
          }) as never,
        } as never);
      } catch (caught) {
        onError(
          caught instanceof Error
            ? caught.message
            : 'Unable to start league night.'
        );
      }
    })();
  }, [
    createSession,
    displaySessions,
    isCreatingSession,
    isFocused,
    isSessionsLoading,
    leagueClientSyncId,
    leagueId,
    onError,
    rawLeagueId,
    refreshQueuedSessionCreates,
    router,
    startTonight,
  ]);
}
