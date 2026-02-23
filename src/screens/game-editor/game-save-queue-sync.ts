import {
  isRetryableSaveError,
  markQueuedGameSaveEntryRetry,
  migrateQueuedEntryToGameId,
  replaceQueuedGameSaveEntry,
  type QueuedGameSaveEntry,
} from './game-save-queue';

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
  loadQueue?: () => Promise<QueuedGameSaveEntry[]>;
  persistQueue?: (entries: QueuedGameSaveEntry[]) => Promise<void>;
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

type FlushQueuedGameSavesOptions = QueueMutations &
  QueueStorage &
  FlushCallbacks & {
    force?: boolean;
  };

type FlushQueuedGameSavesResult = {
  remainingEntries: QueuedGameSaveEntry[];
};

let queueFlushInFlight: Promise<FlushQueuedGameSavesResult> | null = null;

async function loadDefaultQueue() {
  const module = await import('./game-save-queue-storage');
  return module.loadGameSaveQueue();
}

async function persistDefaultQueue(entries: QueuedGameSaveEntry[]) {
  const module = await import('./game-save-queue-storage');
  await module.persistGameSaveQueue(entries);
}

function getErrorMessage(caught: unknown) {
  if (caught instanceof Error) {
    return caught.message;
  }

  return 'Unable to sync saved game.';
}

function getEntryByQueueId(entries: QueuedGameSaveEntry[], queueId: string) {
  return entries.find((entry) => entry.queueId === queueId) ?? null;
}

function removeQueuedEntryIfSignatureMatches(
  entries: QueuedGameSaveEntry[],
  queueId: string,
  signature: string
) {
  return entries.filter(
    (entry) => !(entry.queueId === queueId && entry.signature === signature)
  );
}

async function applyQueueMutation(
  loadQueue: () => Promise<QueuedGameSaveEntry[]>,
  persistQueue: (entries: QueuedGameSaveEntry[]) => Promise<void>,
  mutate: (entries: QueuedGameSaveEntry[]) => QueuedGameSaveEntry[]
) {
  const latestEntries = await loadQueue();
  const nextEntries = mutate(latestEntries);
  await persistQueue(nextEntries);
  return nextEntries;
}

export async function flushQueuedGameSaves({
  createGame,
  updateGame,
  replaceFramesForGame,
  loadQueue = loadDefaultQueue,
  persistQueue = persistDefaultQueue,
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
    let wasCreated = false;

    try {
      if (!targetGameId) {
        const createdGameId = await createGame({
          sessionId: queueEntry.sessionId as SessionId,
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

export function isQueuedGameSaveFlushInFlight() {
  return queueFlushInFlight !== null;
}

export function flushQueuedGameSavesWithLock(
  options: FlushQueuedGameSavesOptions
) {
  if (queueFlushInFlight) {
    return queueFlushInFlight;
  }

  queueFlushInFlight = flushQueuedGameSaves(options).finally(() => {
    queueFlushInFlight = null;
  });

  return queueFlushInFlight;
}
