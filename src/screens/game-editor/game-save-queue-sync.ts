import {
  isRetryableSaveError,
  markQueuedGameSaveEntryRetry,
  migrateQueuedEntryToGameId,
  removeQueuedGameSaveEntry,
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
  FlushCallbacks;

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

export async function flushQueuedGameSaves({
  createGame,
  updateGame,
  replaceFramesForGame,
  loadQueue = loadDefaultQueue,
  persistQueue = persistDefaultQueue,
  onEntrySynced,
  onEntryFailedNonRetryable,
}: FlushQueuedGameSavesOptions): Promise<FlushQueuedGameSavesResult> {
  let queueEntries = await loadQueue();
  const now = Date.now();
  const dueEntries = queueEntries
    .filter((entry) => entry.nextRetryAt <= now)
    .sort((left, right) => left.updatedAt - right.updatedAt);

  if (dueEntries.length === 0) {
    return { remainingEntries: queueEntries };
  }

  for (const dueEntry of dueEntries) {
    let queueEntry = dueEntry;
    let targetGameId = queueEntry.gameId as GameId | null;
    let wasCreated = false;

    try {
      if (!targetGameId) {
        const createdGameId = await createGame({
          sessionId: queueEntry.sessionId as SessionId,
          date: queueEntry.date,
        });
        queueEntry = migrateQueuedEntryToGameId(queueEntry, createdGameId, now);
        queueEntries = replaceQueuedGameSaveEntry(
          queueEntries,
          dueEntry.queueId,
          queueEntry
        );
        await persistQueue(queueEntries);
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

      queueEntries = removeQueuedGameSaveEntry(
        queueEntries,
        queueEntry.queueId
      );
      await persistQueue(queueEntries);

      onEntrySynced?.({
        entry: queueEntry,
        originalQueueId: dueEntry.queueId,
        targetGameId,
        wasCreated,
      });
    } catch (caught) {
      if (!isRetryableSaveError(caught)) {
        queueEntries = removeQueuedGameSaveEntry(
          queueEntries,
          queueEntry.queueId
        );
        await persistQueue(queueEntries);

        onEntryFailedNonRetryable?.({
          entry: queueEntry,
          originalQueueId: dueEntry.queueId,
          error: caught,
        });
        continue;
      }

      queueEntries = markQueuedGameSaveEntryRetry(
        queueEntries,
        queueEntry.queueId,
        getErrorMessage(caught),
        Date.now()
      );
      await persistQueue(queueEntries);
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
