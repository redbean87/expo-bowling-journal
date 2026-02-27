export { getFirstParam } from '@/utils/route-params';

type ResolveJournalRouteIdsInput = {
  leagueId?: string | null;
  rawLeagueId?: string | null;
  sessionId?: string | null;
  rawSessionId?: string | null;
};

type BuildJournalGamesRouteParamsInput = {
  leagueId: string;
  sessionId: string;
  leagueClientSyncId?: string | null;
  sessionClientSyncId?: string | null;
  sessionDate?: string | null;
  sessionWeekNumber?: number | null;
  startEntry?: boolean;
};

type BuildJournalGameEditorRouteParamsInput =
  BuildJournalGamesRouteParamsInput & {
    gameId: string;
    draftNonce?: string | null;
  };

export function resolveJournalRouteIds({
  leagueId,
  rawLeagueId,
  sessionId,
  rawSessionId,
}: ResolveJournalRouteIdsInput) {
  return {
    leagueRouteId: leagueId ?? rawLeagueId ?? null,
    sessionRouteId: sessionId ?? rawSessionId ?? null,
  };
}

export function buildJournalGamesRouteParams({
  leagueId,
  sessionId,
  leagueClientSyncId,
  sessionClientSyncId,
  sessionDate,
  sessionWeekNumber,
  startEntry = false,
}: BuildJournalGamesRouteParamsInput) {
  return {
    leagueId,
    sessionId,
    ...(leagueClientSyncId ? { leagueClientSyncId } : {}),
    ...(sessionClientSyncId ? { sessionClientSyncId } : {}),
    ...(sessionDate ? { sessionDate } : {}),
    ...(typeof sessionWeekNumber === 'number'
      ? { sessionWeekNumber: String(sessionWeekNumber) }
      : {}),
    ...(startEntry ? { startEntry: '1' } : {}),
  };
}

export function buildJournalGameEditorRouteParams({
  gameId,
  draftNonce,
  ...target
}: BuildJournalGameEditorRouteParamsInput) {
  return {
    ...buildJournalGamesRouteParams(target),
    gameId,
    ...(draftNonce ? { draftNonce } : {}),
  };
}
