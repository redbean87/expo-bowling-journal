import {
  loadJournalClientSyncMap,
  upsertLeagueClientSyncMapping,
  upsertSessionClientSyncMapping,
} from './journal-client-sync-map-storage';
import {
  getDueQueuedJournalCreateEntries,
  isRetryableCreateError,
  markQueuedJournalCreateEntryRetry,
  removeQueuedJournalCreateEntry,
  type QueuedJournalCreateEntry,
} from './journal-create-queue';
import {
  loadJournalCreateQueue,
  persistJournalCreateQueue,
} from './journal-create-queue-storage';
import { resolveReferenceIdFromSyncMap } from './reference-draft-id';

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

type QueueMutations = {
  createLeague: (input: CreateLeagueInput) => Promise<LeagueId>;
  updateLeague: (input: UpdateLeagueInput) => Promise<LeagueId>;
  removeLeague: (input: RemoveLeagueInput) => Promise<LeagueId>;
  createSession: (input: CreateSessionInput) => Promise<SessionId>;
  updateSession: (input: UpdateSessionInput) => Promise<SessionId>;
  removeSession: (input: RemoveSessionInput) => Promise<SessionId>;
};

type QueueStorage = {
  loadQueue?: () => Promise<QueuedJournalCreateEntry[]>;
  persistQueue?: (entries: QueuedJournalCreateEntry[]) => Promise<void>;
};

type FlushJournalCreateQueueOptions = QueueMutations &
  QueueStorage & {
    force?: boolean;
  };

type FlushJournalCreateQueueResult = {
  remainingEntries: QueuedJournalCreateEntry[];
};

let queueFlushInFlight: Promise<FlushJournalCreateQueueResult> | null = null;

function getErrorMessage(caught: unknown) {
  if (caught instanceof Error) {
    return caught.message;
  }

  return 'Unable to sync queued create action.';
}

function getEntryByQueueId(
  entries: QueuedJournalCreateEntry[],
  queueId: string
) {
  return entries.find((entry) => entry.queueId === queueId) ?? null;
}

function resolveQueuedReferenceId({
  referenceId,
  syncMap,
}: {
  referenceId: string | null | undefined;
  syncMap: Awaited<ReturnType<typeof loadJournalClientSyncMap>>;
}) {
  const resolution = resolveReferenceIdFromSyncMap(referenceId, syncMap);

  if (resolution.pendingDraftReference) {
    return {
      resolvedId: null,
      missingReferenceType: resolution.pendingDraftReference.referenceType,
    } as const;
  }

  return {
    resolvedId: resolution.resolvedId,
    missingReferenceType: null,
  } as const;
}

async function applyQueueMutation(
  loadQueue: () => Promise<QueuedJournalCreateEntry[]>,
  persistQueue: (entries: QueuedJournalCreateEntry[]) => Promise<void>,
  mutate: (entries: QueuedJournalCreateEntry[]) => QueuedJournalCreateEntry[]
) {
  const latestEntries = await loadQueue();
  const nextEntries = mutate(latestEntries);
  await persistQueue(nextEntries);
  return nextEntries;
}

export async function flushJournalCreateQueue({
  createLeague,
  updateLeague,
  removeLeague,
  createSession,
  updateSession,
  removeSession,
  loadQueue = loadJournalCreateQueue,
  persistQueue = persistJournalCreateQueue,
  force = false,
}: FlushJournalCreateQueueOptions): Promise<FlushJournalCreateQueueResult> {
  let queueEntries = await loadQueue();
  const now = Date.now();
  const dueEntries = getDueQueuedJournalCreateEntries(queueEntries, now).filter(
    (entry) => force || entry.nextRetryAt <= now
  );

  if (dueEntries.length === 0) {
    return { remainingEntries: queueEntries };
  }

  for (const dueEntry of dueEntries) {
    const latestEntries = await loadQueue();
    const latestDueEntry = getEntryByQueueId(latestEntries, dueEntry.queueId);

    if (!latestDueEntry) {
      continue;
    }

    try {
      if (latestDueEntry.entityType === 'league-create') {
        const syncMap = await loadJournalClientSyncMap();
        const resolvedHouseId = resolveQueuedReferenceId({
          referenceId: latestDueEntry.payload.houseId
            ? String(latestDueEntry.payload.houseId)
            : null,
          syncMap,
        });

        if (resolvedHouseId.missingReferenceType) {
          queueEntries = await applyQueueMutation(
            loadQueue,
            persistQueue,
            (entries) =>
              markQueuedJournalCreateEntryRetry(
                entries,
                latestDueEntry.queueId,
                `Waiting for ${resolvedHouseId.missingReferenceType} sync before creating league.`,
                Date.now()
              )
          );
          continue;
        }

        const leagueId = await createLeague({
          ...latestDueEntry.payload,
          houseId: (resolvedHouseId.resolvedId as never) ?? null,
          clientSyncId: latestDueEntry.clientSyncId,
        });

        await upsertLeagueClientSyncMapping(
          latestDueEntry.clientSyncId,
          leagueId
        );
      } else if (latestDueEntry.entityType === 'league-update') {
        const syncMap = await loadJournalClientSyncMap();
        let targetLeagueId = latestDueEntry.leagueId ?? null;

        if (!targetLeagueId && latestDueEntry.leagueClientSyncId) {
          const syncMap = await loadJournalClientSyncMap();
          targetLeagueId =
            (syncMap.leagues[latestDueEntry.leagueClientSyncId] as
              | LeagueId
              | undefined) ?? null;
        }

        if (!targetLeagueId) {
          queueEntries = await applyQueueMutation(
            loadQueue,
            persistQueue,
            (entries) =>
              markQueuedJournalCreateEntryRetry(
                entries,
                latestDueEntry.queueId,
                'Waiting for league sync before updating league.',
                Date.now()
              )
          );
          continue;
        }

        const resolvedHouseId = resolveQueuedReferenceId({
          referenceId: latestDueEntry.payload.houseId
            ? String(latestDueEntry.payload.houseId)
            : null,
          syncMap,
        });

        if (resolvedHouseId.missingReferenceType) {
          queueEntries = await applyQueueMutation(
            loadQueue,
            persistQueue,
            (entries) =>
              markQueuedJournalCreateEntryRetry(
                entries,
                latestDueEntry.queueId,
                `Waiting for ${resolvedHouseId.missingReferenceType} sync before updating league.`,
                Date.now()
              )
          );
          continue;
        }

        await updateLeague({
          leagueId: targetLeagueId,
          ...latestDueEntry.payload,
          houseId: (resolvedHouseId.resolvedId as never) ?? null,
        });
      } else if (latestDueEntry.entityType === 'league-delete') {
        let targetLeagueId = latestDueEntry.leagueId ?? null;

        if (!targetLeagueId && latestDueEntry.leagueClientSyncId) {
          const syncMap = await loadJournalClientSyncMap();
          targetLeagueId =
            (syncMap.leagues[latestDueEntry.leagueClientSyncId] as
              | LeagueId
              | undefined) ?? null;
        }

        if (!targetLeagueId) {
          queueEntries = await applyQueueMutation(
            loadQueue,
            persistQueue,
            (entries) =>
              markQueuedJournalCreateEntryRetry(
                entries,
                latestDueEntry.queueId,
                'Waiting for league sync before deleting league.',
                Date.now()
              )
          );
          continue;
        }

        await removeLeague({ leagueId: targetLeagueId });
      } else if (latestDueEntry.entityType === 'session-create') {
        const syncMap = await loadJournalClientSyncMap();
        let targetLeagueId = latestDueEntry.payload.leagueId ?? null;

        if (!targetLeagueId && latestDueEntry.payload.leagueClientSyncId) {
          const syncMap = await loadJournalClientSyncMap();
          targetLeagueId =
            (syncMap.leagues[latestDueEntry.payload.leagueClientSyncId] as
              | LeagueId
              | undefined) ?? null;
        }

        if (!targetLeagueId) {
          queueEntries = await applyQueueMutation(
            loadQueue,
            persistQueue,
            (entries) =>
              markQueuedJournalCreateEntryRetry(
                entries,
                latestDueEntry.queueId,
                'Waiting for league sync before creating session.',
                Date.now()
              )
          );
          continue;
        }

        const resolvedHouseId = resolveQueuedReferenceId({
          referenceId: latestDueEntry.payload.houseId
            ? String(latestDueEntry.payload.houseId)
            : null,
          syncMap,
        });
        const resolvedPatternId = resolveQueuedReferenceId({
          referenceId: latestDueEntry.payload.patternId
            ? String(latestDueEntry.payload.patternId)
            : null,
          syncMap,
        });
        const resolvedBallId = resolveQueuedReferenceId({
          referenceId: latestDueEntry.payload.ballId
            ? String(latestDueEntry.payload.ballId)
            : null,
          syncMap,
        });
        const missingReferenceType =
          resolvedHouseId.missingReferenceType ??
          resolvedPatternId.missingReferenceType ??
          resolvedBallId.missingReferenceType;

        if (missingReferenceType) {
          queueEntries = await applyQueueMutation(
            loadQueue,
            persistQueue,
            (entries) =>
              markQueuedJournalCreateEntryRetry(
                entries,
                latestDueEntry.queueId,
                `Waiting for ${missingReferenceType} sync before creating session.`,
                Date.now()
              )
          );
          continue;
        }

        const sessionId = await createSession({
          leagueId: targetLeagueId,
          date: latestDueEntry.payload.date,
          weekNumber: latestDueEntry.payload.weekNumber,
          houseId: (resolvedHouseId.resolvedId as never) ?? null,
          patternId: (resolvedPatternId.resolvedId as never) ?? null,
          ballId: (resolvedBallId.resolvedId as never) ?? null,
          clientSyncId: latestDueEntry.clientSyncId,
        });

        await upsertSessionClientSyncMapping(
          latestDueEntry.clientSyncId,
          sessionId
        );
      } else if (latestDueEntry.entityType === 'session-update') {
        const syncMap = await loadJournalClientSyncMap();
        let targetSessionId = latestDueEntry.sessionId ?? null;

        if (!targetSessionId && latestDueEntry.sessionClientSyncId) {
          const syncMap = await loadJournalClientSyncMap();
          targetSessionId =
            (syncMap.sessions[latestDueEntry.sessionClientSyncId] as
              | SessionId
              | undefined) ?? null;
        }

        if (!targetSessionId) {
          queueEntries = await applyQueueMutation(
            loadQueue,
            persistQueue,
            (entries) =>
              markQueuedJournalCreateEntryRetry(
                entries,
                latestDueEntry.queueId,
                'Waiting for session sync before updating session.',
                Date.now()
              )
          );
          continue;
        }

        const resolvedHouseId = resolveQueuedReferenceId({
          referenceId: latestDueEntry.payload.houseId
            ? String(latestDueEntry.payload.houseId)
            : null,
          syncMap,
        });
        const resolvedPatternId = resolveQueuedReferenceId({
          referenceId: latestDueEntry.payload.patternId
            ? String(latestDueEntry.payload.patternId)
            : null,
          syncMap,
        });
        const resolvedBallId = resolveQueuedReferenceId({
          referenceId: latestDueEntry.payload.ballId
            ? String(latestDueEntry.payload.ballId)
            : null,
          syncMap,
        });
        const missingReferenceType =
          resolvedHouseId.missingReferenceType ??
          resolvedPatternId.missingReferenceType ??
          resolvedBallId.missingReferenceType;

        if (missingReferenceType) {
          queueEntries = await applyQueueMutation(
            loadQueue,
            persistQueue,
            (entries) =>
              markQueuedJournalCreateEntryRetry(
                entries,
                latestDueEntry.queueId,
                `Waiting for ${missingReferenceType} sync before updating session.`,
                Date.now()
              )
          );
          continue;
        }

        await updateSession({
          sessionId: targetSessionId,
          ...latestDueEntry.payload,
          houseId: (resolvedHouseId.resolvedId as never) ?? null,
          patternId: (resolvedPatternId.resolvedId as never) ?? null,
          ballId: (resolvedBallId.resolvedId as never) ?? null,
        });
      } else {
        let targetSessionId = latestDueEntry.sessionId ?? null;

        if (!targetSessionId && latestDueEntry.sessionClientSyncId) {
          const syncMap = await loadJournalClientSyncMap();
          targetSessionId =
            (syncMap.sessions[latestDueEntry.sessionClientSyncId] as
              | SessionId
              | undefined) ?? null;
        }

        if (!targetSessionId) {
          queueEntries = await applyQueueMutation(
            loadQueue,
            persistQueue,
            (entries) =>
              markQueuedJournalCreateEntryRetry(
                entries,
                latestDueEntry.queueId,
                'Waiting for session sync before deleting session.',
                Date.now()
              )
          );
          continue;
        }

        await removeSession({ sessionId: targetSessionId });
      }

      queueEntries = await applyQueueMutation(
        loadQueue,
        persistQueue,
        (entries) =>
          removeQueuedJournalCreateEntry(entries, latestDueEntry.queueId)
      );
    } catch (caught) {
      if (!isRetryableCreateError(caught)) {
        queueEntries = await applyQueueMutation(
          loadQueue,
          persistQueue,
          (entries) =>
            removeQueuedJournalCreateEntry(entries, latestDueEntry.queueId)
        );
        continue;
      }

      queueEntries = await applyQueueMutation(
        loadQueue,
        persistQueue,
        (entries) =>
          markQueuedJournalCreateEntryRetry(
            entries,
            latestDueEntry.queueId,
            getErrorMessage(caught),
            Date.now()
          )
      );
    }
  }

  return { remainingEntries: await loadQueue() };
}

export function flushJournalCreateQueueWithLock(
  options: FlushJournalCreateQueueOptions
) {
  if (queueFlushInFlight) {
    return queueFlushInFlight;
  }

  queueFlushInFlight = flushJournalCreateQueue(options).finally(() => {
    queueFlushInFlight = null;
  });

  return queueFlushInFlight;
}
