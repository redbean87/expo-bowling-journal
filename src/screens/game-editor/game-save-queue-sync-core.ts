import {
  isRetryableSaveError,
  markQueuedGameSaveEntryRetry,
  migrateQueuedEntryToGameId,
  replaceQueuedGameSaveEntry,
  type QueuedGameSaveEntry,
} from './game-save-queue';
import {
  applyQueueMutation,
  getEntryByQueueId,
  getErrorMessage,
  loadJournalSyncMapDefault,
  removeQueuedEntryIfSignatureMatches,
} from './game-save-queue-sync-storage';

import type {
  CreateGameInput,
  GameId,
  ReplaceFramesInput,
  SessionId,
  UpdateGameInput,
} from '@/services/journal';

type QueueMutations = {
  createGame: (input: CreateGameInput) => Promise<GameId>;
  updateGame: (input: UpdateGameInput) => Promise<unknown>;
  replaceFramesForGame: (input: ReplaceFramesInput) => Promise<unknown>;
};

type QueueStorage = {
  loadQueue: () => Promise<QueuedGameSaveEntry[]>;
  persistQueue: (entries: QueuedGameSaveEntry[]) => Promise<void>;
};

type FlushCallbacks = {
  onEntrySynced?: (args: {
    entry: QueuedGameSaveEntry;
    originalQueueId: string;
    targetGameId: GameId;
    wasCreated: boolean;
  }) => void;
  onEntryFailedNonRetryable?: (args: {
    entry: QueuedGameSaveEntry;
    originalQueueId: string;
    error: unknown;
  }) => void;
};

export type FlushQueuedGameSavesOptions = QueueMutations &
  QueueStorage &
  FlushCallbacks & {
    force?: boolean;
  };

export type FlushQueuedGameSavesResult = {
  remainingEntries: QueuedGameSaveEntry[];
};

export async function flushQueuedGameSavesCore({
  createGame,
  updateGame,
  replaceFramesForGame,
  loadQueue,
  persistQueue,
  onEntrySynced,
  onEntryFailedNonRetryable,
  force = false,
}: FlushQueuedGameSavesOptions): Promise<FlushQueuedGameSavesResult> {
  let queueEntries = await loadQueue();
  const now = Date.now();
  const dueEntries = queueEntries
    .filter((entry) => force || entry.nextRetryAt <= now)
    .sort((left, right) => left.updatedAt - right.updatedAt);

  if (dueEntries.length === 0) {
    return { remainingEntries: queueEntries };
  }

  for (const dueEntry of dueEntries) {
    const latestEntries = await loadQueue();
    const latestDueEntry = getEntryByQueueId(latestEntries, dueEntry.queueId);

    if (!latestDueEntry) {
      continue;
    }

    let queueEntry = latestDueEntry;
    let targetGameId = queueEntry.gameId as GameId | null;
    let targetSessionId = queueEntry.sessionId as SessionId;
    let wasCreated = false;

    try {
      if (queueEntry.sessionId.startsWith('draft-')) {
        const fallbackClientSyncId = queueEntry.sessionId.slice(6);
        const syncMap = await loadJournalSyncMapDefault();
        const mappedSessionId = queueEntry.sessionClientSyncId
          ? syncMap.sessions[queueEntry.sessionClientSyncId]
          : syncMap.sessions[fallbackClientSyncId];

        if (!mappedSessionId) {
          queueEntries = await applyQueueMutation(
            loadQueue,
            persistQueue,
            (entries) =>
              markQueuedGameSaveEntryRetry(
                entries,
                queueEntry.queueId,
                'Waiting for session sync before creating game.',
                Date.now()
              )
          );
          continue;
        }

        targetSessionId = mappedSessionId as SessionId;

        queueEntries = await applyQueueMutation(
          loadQueue,
          persistQueue,
          (entries) =>
            entries.map((entry) => {
              if (entry.queueId !== queueEntry.queueId) {
                return entry;
              }

              return {
                ...entry,
                sessionId: mappedSessionId,
                updatedAt: Date.now(),
              };
            })
        );

        const refreshedEntries = await loadQueue();
        const refreshedQueueEntry = getEntryByQueueId(
          refreshedEntries,
          queueEntry.queueId
        );

        if (refreshedQueueEntry) {
          queueEntry = refreshedQueueEntry;
        }
      }

      if (!targetGameId) {
        const createdGameId = await createGame({
          sessionId: targetSessionId,
          date: queueEntry.date,
          clientSyncId: queueEntry.draftNonce ?? queueEntry.queueId,
        });
        const migratedAt = Date.now();
        queueEntries = await applyQueueMutation(
          loadQueue,
          persistQueue,
          (entries) => {
            const latestQueuedEntry = getEntryByQueueId(
              entries,
              dueEntry.queueId
            );

            if (!latestQueuedEntry) {
              return entries;
            }

            queueEntry = migrateQueuedEntryToGameId(
              latestQueuedEntry,
              createdGameId,
              migratedAt
            );

            return replaceQueuedGameSaveEntry(
              entries,
              dueEntry.queueId,
              queueEntry
            );
          }
        );
        targetGameId = createdGameId;
        wasCreated = true;
      } else {
        await updateGame({
          gameId: targetGameId,
          date: queueEntry.date,
        });
      }

      await replaceFramesForGame({
        gameId: targetGameId,
        frames: queueEntry.frames,
      });

      queueEntries = await applyQueueMutation(
        loadQueue,
        persistQueue,
        (entries) =>
          removeQueuedEntryIfSignatureMatches(
            entries,
            queueEntry.queueId,
            queueEntry.signature
          )
      );

      onEntrySynced?.({
        entry: queueEntry,
        originalQueueId: dueEntry.queueId,
        targetGameId,
        wasCreated,
      });
    } catch (caught) {
      if (!isRetryableSaveError(caught)) {
        queueEntries = await applyQueueMutation(
          loadQueue,
          persistQueue,
          (entries) =>
            removeQueuedEntryIfSignatureMatches(
              entries,
              queueEntry.queueId,
              queueEntry.signature
            )
        );

        onEntryFailedNonRetryable?.({
          entry: queueEntry,
          originalQueueId: dueEntry.queueId,
          error: caught,
        });
        continue;
      }

      queueEntries = await applyQueueMutation(
        loadQueue,
        persistQueue,
        (entries) => {
          const currentEntry = getEntryByQueueId(entries, queueEntry.queueId);

          if (!currentEntry) {
            return entries;
          }

          return markQueuedGameSaveEntryRetry(
            entries,
            currentEntry.queueId,
            getErrorMessage(caught),
            Date.now()
          );
        }
      );
    }
  }

  return { remainingEntries: await loadQueue() };
}
