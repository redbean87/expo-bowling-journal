import { useEffect, useRef } from 'react';

import type { DisplaySession } from '@/hooks/journal/use-session-queue';
import type { LeagueId, SessionId } from '@/services/journal';
import type { Router } from 'expo-router';

import { buildJournalGamesRouteParams } from '@/screens/journal/journal-route-params';
import { formatIsoDateForToday } from '@/screens/journal-fast-lane-utils';

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
  // The sessions screen still passes this callback (it keeps it for its own
  // queued-draft rows), but the local-first start-tonight path no longer
  // refreshes a legacy queue, so this hook accepts and ignores it.
  refreshQueuedSessionCreates?: () => Promise<void>;
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
      // Local-first routing: the games route needs the persisted local
      // session id. A display row that has none — one that only exists as an
      // already-persisted legacy queue draft — has nothing to address locally,
      // so it reports instead of minting a `draft-<clientSyncId>` phantom the
      // journal has no data behind.
      const targetSessionRouteId = existingDisplaySession.sessionId;

      if (targetSessionRouteId === null) {
        onError('The session for today has no local journal id to open.');
        return;
      }

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

    // Local-first session create (C-2 follow-up T2): the league row this
    // screen is showing has no local journal id of its own — it came from a
    // route, and in local mode that route carries the local league id the
    // converted leagues screen wrote (C-2 follow-up T1 removed the `draft-`
    // league routes). So the session goes straight to the converted,
    // SQLite-backed `createSession` the app boundary already exposes
    // (`use-sessions` → `src/services/journal/local-writes.ts`), awaited
    // rather than wrapped: no `isNavigatorOffline()` enqueue branch, no
    // `withTimeout` around a server round-trip, no `isRetryableCreateError`
    // re-queue fallback, and no `refreshQueuedSessionCreates()` pass. Nothing
    // here reads, writes, or drains the legacy journal-create queue, so an
    // entry a pre-C-2 run already persisted stays untouched, and background
    // sync and retry stay off in local mode. A row whose route carries only
    // a legacy `draft-` league id has no local league to hang a session on:
    // the service's foreign key rejects it and that rejection is reported
    // below, never turned into a phantom `draft-<clientSyncId>` session.
    void (async () => {
      try {
        const sessionId = await createSession({
          leagueId: targetLeagueRouteId as LeagueId,
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
    router,
    startTonight,
  ]);
}
