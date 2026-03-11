import { useCallback, useEffect, useMemo, useState } from 'react';

import type { LeagueId } from '@/services/journal';

import {
  loadJournalClientSyncMap,
  type JournalClientSyncMap,
} from '@/screens/journal/journal-client-sync-map-storage';
import { type QueuedSessionCreateEntry } from '@/screens/journal/journal-create-queue';
import { loadJournalCreateQueue } from '@/screens/journal/journal-create-queue-storage';

export type DisplaySession = {
  id: string;
  sessionId: string | null;
  clientSyncId: string | null;
  date: string;
  weekNumber: number | null;
  houseId: string | null;
  patternId: string | null;
  ballId: string | null;
  isDraft: boolean;
};

type Session = {
  _id: string;
  date: string;
  weekNumber?: number | null;
  houseId?: string | number | null;
  patternId?: string | number | null;
  ballId?: string | number | null;
  clientSyncId?: string | null;
};

type UseSessionQueueParams = {
  leagueId: LeagueId | null;
  leagueClientSyncId: string | null;
  sessions: Session[];
};

export function useSessionQueue({
  leagueId,
  leagueClientSyncId,
  sessions,
}: UseSessionQueueParams) {
  const [queuedSessionCreates, setQueuedSessionCreates] = useState<
    QueuedSessionCreateEntry[]
  >([]);
  const [draftLeagueName, setDraftLeagueName] = useState<string | null>(null);
  const [syncMap, setSyncMap] = useState<JournalClientSyncMap>({
    leagues: {},
    sessions: {},
    houses: {},
    patterns: {},
    balls: {},
  });

  const refreshQueuedSessionCreates = useCallback(async () => {
    const [queueEntries, nextSyncMap] = await Promise.all([
      loadJournalCreateQueue(),
      loadJournalClientSyncMap(),
    ]);

    setSyncMap(nextSyncMap);

    const filteredEntries = queueEntries.filter((entry) => {
      if (entry.entityType !== 'session-create') {
        return false;
      }

      if (leagueId && entry.payload.leagueId === leagueId) {
        return true;
      }

      if (
        leagueId &&
        entry.payload.leagueClientSyncId &&
        nextSyncMap.leagues[entry.payload.leagueClientSyncId] === leagueId
      ) {
        return true;
      }

      if (
        !leagueId &&
        leagueClientSyncId &&
        entry.payload.leagueClientSyncId === leagueClientSyncId
      ) {
        return true;
      }

      return false;
    }) as QueuedSessionCreateEntry[];

    setQueuedSessionCreates(filteredEntries);

    if (leagueClientSyncId) {
      const queuedLeague = queueEntries.find(
        (entry) =>
          entry.entityType === 'league-create' &&
          entry.clientSyncId === leagueClientSyncId
      );
      setDraftLeagueName(
        queuedLeague && queuedLeague.entityType === 'league-create'
          ? queuedLeague.payload.name
          : null
      );
    } else {
      setDraftLeagueName(null);
    }
  }, [leagueClientSyncId, leagueId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshQueuedSessionCreates();
  }, [refreshQueuedSessionCreates]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshQueuedSessionCreates();
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [refreshQueuedSessionCreates]);

  const derivedWeekNumberBySessionId = useMemo(() => {
    const oldestFirstSessions = [...sessions].reverse();

    return new Map(
      oldestFirstSessions.map((session, index) => [session._id, index + 1])
    );
  }, [sessions]);

  const displaySessions = useMemo<DisplaySession[]>(() => {
    const serverByClientSyncId = new Map<string, string>();
    const serverSessions: DisplaySession[] = sessions.map((session) => {
      const clientSyncId =
        typeof (session as { clientSyncId?: string | null }).clientSyncId ===
        'string'
          ? ((session as { clientSyncId?: string | null }).clientSyncId ?? null)
          : null;

      if (clientSyncId) {
        serverByClientSyncId.set(clientSyncId, session._id);
      }

      return {
        id: session._id,
        sessionId: session._id,
        clientSyncId,
        date: session.date,
        weekNumber: session.weekNumber ?? null,
        houseId: session.houseId ? String(session.houseId) : null,
        patternId: session.patternId ? String(session.patternId) : null,
        ballId: session.ballId ? String(session.ballId) : null,
        isDraft: false,
      };
    });

    const queuedDrafts: DisplaySession[] = queuedSessionCreates
      .filter((entry) => !serverByClientSyncId.has(entry.clientSyncId))
      .map((entry) => ({
        id: `draft-${entry.clientSyncId}`,
        sessionId: null,
        clientSyncId: entry.clientSyncId,
        date: entry.payload.date,
        weekNumber: entry.payload.weekNumber ?? null,
        houseId: entry.payload.houseId ? String(entry.payload.houseId) : null,
        patternId: entry.payload.patternId
          ? String(entry.payload.patternId)
          : null,
        ballId: entry.payload.ballId ? String(entry.payload.ballId) : null,
        isDraft: true,
      }));

    return [...queuedDrafts, ...serverSessions];
  }, [queuedSessionCreates, sessions]);

  const getNextSessionWeekNumber = useCallback(
    (sessionCreateEntries: QueuedSessionCreateEntry[]) => {
      const candidateWeeks: number[] = [];

      sessions.forEach((session) => {
        const derivedWeek =
          session.weekNumber ??
          derivedWeekNumberBySessionId.get(session._id) ??
          null;

        if (typeof derivedWeek === 'number' && Number.isInteger(derivedWeek)) {
          candidateWeeks.push(derivedWeek);
        }
      });

      sessionCreateEntries.forEach((entry) => {
        const queuedWeek = entry.payload.weekNumber;

        if (typeof queuedWeek === 'number' && Number.isInteger(queuedWeek)) {
          candidateWeeks.push(queuedWeek);
        }
      });

      if (candidateWeeks.length > 0) {
        return Math.max(...candidateWeeks) + 1;
      }

      return sessions.length + sessionCreateEntries.length + 1;
    },
    [derivedWeekNumberBySessionId, sessions]
  );

  const suggestedSessionWeekNumber = useMemo(() => {
    return getNextSessionWeekNumber(queuedSessionCreates);
  }, [getNextSessionWeekNumber, queuedSessionCreates]);

  return {
    queuedSessionCreates,
    setQueuedSessionCreates,
    draftLeagueName,
    syncMap,
    displaySessions,
    derivedWeekNumberBySessionId,
    getNextSessionWeekNumber,
    suggestedSessionWeekNumber,
    refreshQueuedSessionCreates,
  };
}
