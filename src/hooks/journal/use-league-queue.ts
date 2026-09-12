import { useCallback, useEffect, useMemo, useState } from 'react';

import type { League } from '@/services/journal';

import {
  loadJournalClientSyncMap,
  type JournalClientSyncMap,
} from '@/screens/journal/journal-client-sync-map-storage';
import { type QueuedLeagueCreateEntry } from '@/screens/journal/journal-create-queue';
import { loadJournalCreateQueue } from '@/screens/journal/journal-create-queue-storage';

export type DisplayLeague =
  | League
  | {
      _id: string;
      name: string;
      type?: 'league' | 'tournament' | 'open';
      clientSyncId: string;
      gamesPerSession?: number | null;
      houseId?: string | null;
      houseName?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      isDraft: true;
    };

type UseLeagueQueueParams = {
  leagues: League[];
};

export function useLeagueQueue({ leagues }: UseLeagueQueueParams) {
  const [queuedLeagueCreates, setQueuedLeagueCreates] = useState<
    QueuedLeagueCreateEntry[]
  >([]);
  const [_syncMap, setSyncMap] = useState<JournalClientSyncMap>({
    leagues: {},
    sessions: {},
    houses: {},
    patterns: {},
    balls: {},
  });

  const refreshQueuedLeagueCreates = useCallback(async () => {
    const [queueEntries, nextSyncMap] = await Promise.all([
      loadJournalCreateQueue(),
      loadJournalClientSyncMap(),
    ]);

    setSyncMap(nextSyncMap);

    const filteredEntries = queueEntries.filter((entry) => {
      if (entry.entityType !== 'league-create') {
        return false;
      }

      return true;
    }) as QueuedLeagueCreateEntry[];

    setQueuedLeagueCreates(filteredEntries);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshQueuedLeagueCreates();
  }, [refreshQueuedLeagueCreates]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshQueuedLeagueCreates();
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [refreshQueuedLeagueCreates]);

  const displayLeagues = useMemo<DisplayLeague[]>(() => {
    const serverByClientSyncId = new Map<string, string>();
    const serverLeagues: DisplayLeague[] = leagues.map((league) => {
      const clientSyncId = league.clientSyncId ?? null;

      if (clientSyncId) {
        serverByClientSyncId.set(clientSyncId, league._id);
      }

      return {
        ...league,
      };
    });

    const queuedDrafts: DisplayLeague[] = queuedLeagueCreates
      .filter((entry) => !serverByClientSyncId.has(entry.clientSyncId))
      .map((entry) => ({
        _id: `draft-${entry.clientSyncId}`,
        name: entry.payload.name,
        type: undefined,
        clientSyncId: entry.clientSyncId,
        gamesPerSession: entry.payload.gamesPerSession ?? null,
        houseId: entry.payload.houseId ? String(entry.payload.houseId) : null,
        houseName: entry.payload.houseName ?? null,
        startDate: entry.payload.startDate ?? null,
        endDate: entry.payload.endDate ?? null,
        isDraft: true as const,
      }));

    return [...queuedDrafts, ...serverLeagues];
  }, [queuedLeagueCreates, leagues]);

  return {
    queuedLeagueCreates,
    displayLeagues,
    refreshQueuedLeagueCreates,
  };
}
