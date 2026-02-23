import { isRetryableSaveError } from '../game-editor/game-save-queue';

import type {
  CreateLeagueInput,
  CreateSessionInput,
  LeagueId,
} from '@/services/journal';

const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000] as const;

type QueueEntryBase = {
  queueId: string;
  entityType: 'league-create' | 'session-create';
  clientSyncId: string;
  attemptCount: number;
  lastAttemptAt: number | null;
  nextRetryAt: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type QueuedLeagueCreateEntry = QueueEntryBase & {
  entityType: 'league-create';
  payload: Omit<CreateLeagueInput, 'clientSyncId'>;
};

export type QueuedSessionCreateEntry = QueueEntryBase & {
  entityType: 'session-create';
  payload: Omit<CreateSessionInput, 'leagueId' | 'clientSyncId'> & {
    leagueId?: LeagueId | null;
    leagueClientSyncId?: string | null;
  };
};

export type QueuedJournalCreateEntry =
  | QueuedLeagueCreateEntry
  | QueuedSessionCreateEntry;

export function buildLeagueCreateQueueId(clientSyncId: string) {
  return `league-create::${clientSyncId}`;
}

export function buildSessionCreateQueueId(clientSyncId: string) {
  return `session-create::${clientSyncId}`;
}

export function createQueuedLeagueCreateEntry(
  input: CreateLeagueInput,
  clientSyncId: string,
  now: number
): QueuedLeagueCreateEntry {
  return {
    queueId: buildLeagueCreateQueueId(clientSyncId),
    entityType: 'league-create',
    clientSyncId,
    payload: {
      name: input.name,
      gamesPerSession: input.gamesPerSession,
      houseId: input.houseId,
    },
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createQueuedSessionCreateEntry(
  input: CreateSessionInput,
  clientSyncId: string,
  leagueClientSyncId: string | null,
  now: number
): QueuedSessionCreateEntry {
  return {
    queueId: buildSessionCreateQueueId(clientSyncId),
    entityType: 'session-create',
    clientSyncId,
    payload: {
      leagueId: input.leagueId,
      leagueClientSyncId,
      date: input.date,
      weekNumber: input.weekNumber,
      houseId: input.houseId,
      patternId: input.patternId,
      ballId: input.ballId,
    },
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertQueuedJournalCreateEntry(
  entries: QueuedJournalCreateEntry[],
  entry: QueuedJournalCreateEntry
) {
  const next = entries.filter((item) => item.queueId !== entry.queueId);
  next.push(entry);
  return next;
}

export function removeQueuedJournalCreateEntry(
  entries: QueuedJournalCreateEntry[],
  queueId: string
) {
  return entries.filter((entry) => entry.queueId !== queueId);
}

export function markQueuedJournalCreateEntryRetry(
  entries: QueuedJournalCreateEntry[],
  queueId: string,
  errorMessage: string,
  now: number
) {
  return entries.map((entry) => {
    if (entry.queueId !== queueId) {
      return entry;
    }

    const nextAttemptCount = entry.attemptCount + 1;
    const delay =
      RETRY_DELAYS_MS[
        Math.min(nextAttemptCount - 1, RETRY_DELAYS_MS.length - 1)
      ];

    return {
      ...entry,
      attemptCount: nextAttemptCount,
      lastAttemptAt: now,
      nextRetryAt: now + delay,
      lastError: errorMessage,
      updatedAt: now,
    } satisfies QueuedJournalCreateEntry;
  });
}

export function getDueQueuedJournalCreateEntries(
  entries: QueuedJournalCreateEntry[],
  now: number
) {
  return entries
    .filter((entry) => entry.nextRetryAt <= now)
    .sort((left, right) => left.updatedAt - right.updatedAt);
}

export function isRetryableCreateError(caught: unknown) {
  return isRetryableSaveError(caught);
}
