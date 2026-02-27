import { isRetryableSaveError } from '../game-editor/game-save-queue';

import type {
  CreateLeagueInput,
  CreateSessionInput,
  LeagueId,
  RemoveLeagueInput,
  RemoveSessionInput,
  SessionId,
  UpdateLeagueInput,
  UpdateSessionInput,
} from '@/services/journal';

const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000] as const;

type QueueEntryMeta = {
  queueId: string;
  entityType:
    | 'league-create'
    | 'league-update'
    | 'league-delete'
    | 'session-create'
    | 'session-update'
    | 'session-delete';
  attemptCount: number;
  lastAttemptAt: number | null;
  nextRetryAt: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type QueuedLeagueCreateEntry = QueueEntryMeta & {
  entityType: 'league-create';
  clientSyncId: string;
  payload: Omit<CreateLeagueInput, 'clientSyncId'>;
};

export type QueuedLeagueUpdateEntry = QueueEntryMeta & {
  entityType: 'league-update';
  leagueId?: LeagueId | null;
  leagueClientSyncId?: string | null;
  payload: Omit<UpdateLeagueInput, 'leagueId'>;
};

export type QueuedLeagueDeleteEntry = QueueEntryMeta & {
  entityType: 'league-delete';
  leagueId?: LeagueId | null;
  leagueClientSyncId?: string | null;
  payload: Omit<RemoveLeagueInput, 'leagueId'>;
};

export type QueuedSessionCreateEntry = QueueEntryMeta & {
  entityType: 'session-create';
  clientSyncId: string;
  payload: Omit<CreateSessionInput, 'leagueId' | 'clientSyncId'> & {
    leagueId?: LeagueId | null;
    leagueClientSyncId?: string | null;
  };
};

export type QueuedSessionUpdateEntry = QueueEntryMeta & {
  entityType: 'session-update';
  sessionId?: SessionId | null;
  sessionClientSyncId?: string | null;
  payload: Omit<UpdateSessionInput, 'sessionId'>;
};

export type QueuedSessionDeleteEntry = QueueEntryMeta & {
  entityType: 'session-delete';
  sessionId?: SessionId | null;
  sessionClientSyncId?: string | null;
  payload: Omit<RemoveSessionInput, 'sessionId'>;
};

export type QueuedJournalCreateEntry =
  | QueuedLeagueCreateEntry
  | QueuedLeagueUpdateEntry
  | QueuedLeagueDeleteEntry
  | QueuedSessionCreateEntry
  | QueuedSessionUpdateEntry
  | QueuedSessionDeleteEntry;

function buildLeagueEntityQueueKey(target: {
  leagueId?: LeagueId | null;
  leagueClientSyncId?: string | null;
}) {
  if (target.leagueId) {
    return `id:${target.leagueId}`;
  }

  if (target.leagueClientSyncId) {
    return `client:${target.leagueClientSyncId}`;
  }

  return 'missing';
}

function buildSessionEntityQueueKey(target: {
  sessionId?: SessionId | null;
  sessionClientSyncId?: string | null;
}) {
  if (target.sessionId) {
    return `id:${target.sessionId}`;
  }

  if (target.sessionClientSyncId) {
    return `client:${target.sessionClientSyncId}`;
  }

  return 'missing';
}

export function buildLeagueCreateQueueId(clientSyncId: string) {
  return `league-create::${clientSyncId}`;
}

export function buildLeagueUpdateQueueId(target: {
  leagueId?: LeagueId | null;
  leagueClientSyncId?: string | null;
}) {
  return `league-update::${buildLeagueEntityQueueKey(target)}`;
}

export function buildLeagueDeleteQueueId(target: {
  leagueId?: LeagueId | null;
  leagueClientSyncId?: string | null;
}) {
  return `league-delete::${buildLeagueEntityQueueKey(target)}`;
}

export function buildSessionCreateQueueId(clientSyncId: string) {
  return `session-create::${clientSyncId}`;
}

export function buildSessionUpdateQueueId(target: {
  sessionId?: SessionId | null;
  sessionClientSyncId?: string | null;
}) {
  return `session-update::${buildSessionEntityQueueKey(target)}`;
}

export function buildSessionDeleteQueueId(target: {
  sessionId?: SessionId | null;
  sessionClientSyncId?: string | null;
}) {
  return `session-delete::${buildSessionEntityQueueKey(target)}`;
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

export function createQueuedLeagueUpdateEntry(
  input: {
    leagueId?: LeagueId | null;
    leagueClientSyncId?: string | null;
  } & Omit<UpdateLeagueInput, 'leagueId'>,
  now: number
): QueuedLeagueUpdateEntry {
  return {
    queueId: buildLeagueUpdateQueueId(input),
    entityType: 'league-update',
    leagueId: input.leagueId ?? null,
    leagueClientSyncId: input.leagueClientSyncId ?? null,
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

export function createQueuedLeagueDeleteEntry(
  input: {
    leagueId?: LeagueId | null;
    leagueClientSyncId?: string | null;
  },
  now: number
): QueuedLeagueDeleteEntry {
  return {
    queueId: buildLeagueDeleteQueueId(input),
    entityType: 'league-delete',
    leagueId: input.leagueId ?? null,
    leagueClientSyncId: input.leagueClientSyncId ?? null,
    payload: {},
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

export function createQueuedSessionUpdateEntry(
  input: {
    sessionId?: SessionId | null;
    sessionClientSyncId?: string | null;
  } & Omit<UpdateSessionInput, 'sessionId'>,
  now: number
): QueuedSessionUpdateEntry {
  return {
    queueId: buildSessionUpdateQueueId(input),
    entityType: 'session-update',
    sessionId: input.sessionId ?? null,
    sessionClientSyncId: input.sessionClientSyncId ?? null,
    payload: {
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

export function createQueuedSessionDeleteEntry(
  input: {
    sessionId?: SessionId | null;
    sessionClientSyncId?: string | null;
  },
  now: number
): QueuedSessionDeleteEntry {
  return {
    queueId: buildSessionDeleteQueueId(input),
    entityType: 'session-delete',
    sessionId: input.sessionId ?? null,
    sessionClientSyncId: input.sessionClientSyncId ?? null,
    payload: {},
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

function areSameLeagueEntity(
  entry: QueuedJournalCreateEntry,
  target: { leagueId?: LeagueId | null; leagueClientSyncId?: string | null }
) {
  const entryLeagueId =
    entry.entityType === 'league-update' || entry.entityType === 'league-delete'
      ? (entry.leagueId ?? null)
      : entry.entityType === 'session-create'
        ? (entry.payload.leagueId ?? null)
        : null;
  const entryLeagueClientSyncId =
    entry.entityType === 'league-create'
      ? entry.clientSyncId
      : entry.entityType === 'league-update' ||
          entry.entityType === 'league-delete'
        ? (entry.leagueClientSyncId ?? null)
        : entry.entityType === 'session-create'
          ? (entry.payload.leagueClientSyncId ?? null)
          : null;

  if (target.leagueId && entryLeagueId) {
    return target.leagueId === entryLeagueId;
  }

  if (target.leagueClientSyncId && entryLeagueClientSyncId) {
    return target.leagueClientSyncId === entryLeagueClientSyncId;
  }

  return false;
}

function areSameSessionEntity(
  entry: QueuedJournalCreateEntry,
  target: { sessionId?: SessionId | null; sessionClientSyncId?: string | null }
) {
  const entrySessionId =
    entry.entityType === 'session-update' ||
    entry.entityType === 'session-delete'
      ? (entry.sessionId ?? null)
      : null;
  const entrySessionClientSyncId =
    entry.entityType === 'session-create'
      ? entry.clientSyncId
      : entry.entityType === 'session-update' ||
          entry.entityType === 'session-delete'
        ? (entry.sessionClientSyncId ?? null)
        : null;

  if (target.sessionId && entrySessionId) {
    return target.sessionId === entrySessionId;
  }

  if (target.sessionClientSyncId && entrySessionClientSyncId) {
    return target.sessionClientSyncId === entrySessionClientSyncId;
  }

  return false;
}

function resetRetryState<TEntry extends QueuedJournalCreateEntry>(
  entry: TEntry,
  now: number
): TEntry {
  return {
    ...entry,
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: now,
    lastError: null,
    updatedAt: now,
  };
}

export function upsertQueuedJournalCreateEntry(
  entries: QueuedJournalCreateEntry[],
  entry: QueuedJournalCreateEntry
) {
  const now = Date.now();

  if (entry.entityType === 'league-update') {
    const existingCreate = entries.find(
      (candidate): candidate is QueuedLeagueCreateEntry =>
        candidate.entityType === 'league-create' &&
        areSameLeagueEntity(candidate, {
          leagueId: entry.leagueId,
          leagueClientSyncId: entry.leagueClientSyncId,
        })
    );

    if (existingCreate) {
      const mergedCreate = resetRetryState(
        {
          ...existingCreate,
          payload: {
            ...existingCreate.payload,
            ...entry.payload,
          },
        },
        now
      );

      return entries.map((candidate) =>
        candidate.queueId === existingCreate.queueId ? mergedCreate : candidate
      );
    }

    const hasDelete = entries.some(
      (candidate) =>
        candidate.entityType === 'league-delete' &&
        areSameLeagueEntity(candidate, {
          leagueId: entry.leagueId,
          leagueClientSyncId: entry.leagueClientSyncId,
        })
    );

    if (hasDelete) {
      return entries;
    }
  }

  if (entry.entityType === 'league-delete') {
    const hasQueuedCreate = entries.some(
      (candidate) =>
        candidate.entityType === 'league-create' &&
        areSameLeagueEntity(candidate, {
          leagueId: entry.leagueId,
          leagueClientSyncId: entry.leagueClientSyncId,
        })
    );

    if (hasQueuedCreate) {
      return entries.filter(
        (candidate) =>
          !(
            (candidate.entityType === 'league-create' ||
              candidate.entityType === 'league-update' ||
              candidate.entityType === 'league-delete') &&
            areSameLeagueEntity(candidate, {
              leagueId: entry.leagueId,
              leagueClientSyncId: entry.leagueClientSyncId,
            })
          )
      );
    }
  }

  if (entry.entityType === 'session-update') {
    const existingCreate = entries.find(
      (candidate): candidate is QueuedSessionCreateEntry =>
        candidate.entityType === 'session-create' &&
        areSameSessionEntity(candidate, {
          sessionId: entry.sessionId,
          sessionClientSyncId: entry.sessionClientSyncId,
        })
    );

    if (existingCreate) {
      const mergedCreate = resetRetryState(
        {
          ...existingCreate,
          payload: {
            ...existingCreate.payload,
            ...entry.payload,
          },
        },
        now
      );

      return entries.map((candidate) =>
        candidate.queueId === existingCreate.queueId ? mergedCreate : candidate
      );
    }

    const hasDelete = entries.some(
      (candidate) =>
        candidate.entityType === 'session-delete' &&
        areSameSessionEntity(candidate, {
          sessionId: entry.sessionId,
          sessionClientSyncId: entry.sessionClientSyncId,
        })
    );

    if (hasDelete) {
      return entries;
    }
  }

  if (entry.entityType === 'session-delete') {
    const hasQueuedCreate = entries.some(
      (candidate) =>
        candidate.entityType === 'session-create' &&
        areSameSessionEntity(candidate, {
          sessionId: entry.sessionId,
          sessionClientSyncId: entry.sessionClientSyncId,
        })
    );

    if (hasQueuedCreate) {
      return entries.filter(
        (candidate) =>
          !(
            (candidate.entityType === 'session-create' ||
              candidate.entityType === 'session-update' ||
              candidate.entityType === 'session-delete') &&
            areSameSessionEntity(candidate, {
              sessionId: entry.sessionId,
              sessionClientSyncId: entry.sessionClientSyncId,
            })
          )
      );
    }
  }

  const next = entries.filter((item) => item.queueId !== entry.queueId);
  next.push(resetRetryState(entry, now));
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
