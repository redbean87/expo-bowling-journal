import {
  upsertBallClientSyncMapping,
  upsertHouseClientSyncMapping,
  upsertPatternClientSyncMapping,
} from './journal-client-sync-map-storage';
import {
  markQueuedReferenceCreateEntryRetry,
  removeQueuedReferenceCreateEntry,
  getDueQueuedReferenceCreateEntries,
  isRetryableReferenceCreateError,
  type QueuedReferenceCreateEntry,
} from './reference-create-queue';
import {
  loadReferenceCreateQueue,
  persistReferenceCreateQueue,
} from './reference-create-queue-storage';

type ReferenceCreateMutations = {
  createHouse: (input: { name: string }) => Promise<string>;
  createPattern: (input: { name: string }) => Promise<string>;
  createBall: (input: { name: string }) => Promise<string>;
};

type QueueStorage = {
  loadQueue?: () => Promise<QueuedReferenceCreateEntry[]>;
  persistQueue?: (entries: QueuedReferenceCreateEntry[]) => Promise<void>;
};

type FlushReferenceCreateQueueOptions = ReferenceCreateMutations &
  QueueStorage & {
    force?: boolean;
  };

type FlushReferenceCreateQueueResult = {
  remainingEntries: QueuedReferenceCreateEntry[];
};

let queueFlushInFlight: Promise<FlushReferenceCreateQueueResult> | null = null;

function getErrorMessage(caught: unknown) {
  if (caught instanceof Error) {
    return caught.message;
  }

  return 'Unable to sync queued reference create action.';
}

function getEntryByQueueId(
  entries: QueuedReferenceCreateEntry[],
  queueId: string
) {
  return entries.find((entry) => entry.queueId === queueId) ?? null;
}

async function applyQueueMutation(
  loadQueue: () => Promise<QueuedReferenceCreateEntry[]>,
  persistQueue: (entries: QueuedReferenceCreateEntry[]) => Promise<void>,
  mutate: (
    entries: QueuedReferenceCreateEntry[]
  ) => QueuedReferenceCreateEntry[]
) {
  const latestEntries = await loadQueue();
  const nextEntries = mutate(latestEntries);
  await persistQueue(nextEntries);
  return nextEntries;
}

export async function flushReferenceCreateQueue({
  createHouse,
  createPattern,
  createBall,
  loadQueue = loadReferenceCreateQueue,
  persistQueue = persistReferenceCreateQueue,
  force = false,
}: FlushReferenceCreateQueueOptions): Promise<FlushReferenceCreateQueueResult> {
  let queueEntries = await loadQueue();
  const now = Date.now();
  const dueEntries = getDueQueuedReferenceCreateEntries(
    queueEntries,
    now
  ).filter((entry) => force || entry.nextRetryAt <= now);

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
      if (latestDueEntry.referenceType === 'house') {
        const houseId = await createHouse({ name: latestDueEntry.name });
        await upsertHouseClientSyncMapping(
          latestDueEntry.clientSyncId,
          houseId
        );
      } else if (latestDueEntry.referenceType === 'pattern') {
        const patternId = await createPattern({ name: latestDueEntry.name });
        await upsertPatternClientSyncMapping(
          latestDueEntry.clientSyncId,
          patternId
        );
      } else {
        const ballId = await createBall({ name: latestDueEntry.name });
        await upsertBallClientSyncMapping(latestDueEntry.clientSyncId, ballId);
      }

      queueEntries = await applyQueueMutation(
        loadQueue,
        persistQueue,
        (entries) =>
          removeQueuedReferenceCreateEntry(entries, latestDueEntry.queueId)
      );
    } catch (caught) {
      if (!isRetryableReferenceCreateError(caught)) {
        queueEntries = await applyQueueMutation(
          loadQueue,
          persistQueue,
          (entries) =>
            removeQueuedReferenceCreateEntry(entries, latestDueEntry.queueId)
        );
        continue;
      }

      queueEntries = await applyQueueMutation(
        loadQueue,
        persistQueue,
        (entries) =>
          markQueuedReferenceCreateEntryRetry(
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

export function flushReferenceCreateQueueWithLock(
  options: FlushReferenceCreateQueueOptions
) {
  if (queueFlushInFlight) {
    return queueFlushInFlight;
  }

  queueFlushInFlight = flushReferenceCreateQueue(options).finally(() => {
    queueFlushInFlight = null;
  });

  return queueFlushInFlight;
}
