import { useLocalSearchParams } from 'expo-router';

import { getFirstParam } from './game-editor-frame-utils';

import type { GameId, LeagueId, SessionId } from '@/services/journal';

export function useGameEditorRouteContext() {
  const params = useLocalSearchParams<{
    leagueId?: string | string[];
    leagueClientSyncId?: string | string[];
    gameId?: string | string[];
    sessionId?: string | string[];
    sessionClientSyncId?: string | string[];
    draftNonce?: string | string[];
  }>();

  const rawLeagueId = getFirstParam(params.leagueId);
  const leagueClientSyncIdParam = getFirstParam(params.leagueClientSyncId);
  const leagueClientSyncId =
    leagueClientSyncIdParam ??
    (rawLeagueId?.startsWith('draft-') ? rawLeagueId.slice(6) : null);

  const gameIdParam = getFirstParam(params.gameId);
  const draftNonceParam = getFirstParam(params.draftNonce);
  const isCreateMode = gameIdParam === 'new';
  const gameId = isCreateMode ? null : (gameIdParam as GameId | null);

  const rawSessionId = getFirstParam(params.sessionId);
  const sessionClientSyncIdParam = getFirstParam(params.sessionClientSyncId);
  const sessionClientSyncId =
    sessionClientSyncIdParam ??
    (rawSessionId?.startsWith('draft-') ? rawSessionId.slice(6) : null);

  const leagueId =
    rawLeagueId && !rawLeagueId.startsWith('draft-')
      ? (rawLeagueId as LeagueId)
      : null;
  const sessionId =
    rawSessionId && !rawSessionId.startsWith('draft-')
      ? (rawSessionId as SessionId)
      : null;
  const isDraftSessionContext =
    Boolean(sessionClientSyncId) ||
    (typeof rawSessionId === 'string' && rawSessionId.startsWith('draft-'));

  return {
    rawLeagueId,
    leagueClientSyncId,
    gameIdParam,
    draftNonceParam,
    isCreateMode,
    gameId,
    rawSessionId,
    sessionClientSyncId,
    leagueId,
    sessionId,
    isDraftSessionContext,
  };
}
