import { getActionableSaveErrorMessage } from './game-save-queue';

export type QueueSyncState =
  | 'idle'
  | 'syncing'
  | 'queued'
  | 'retrying'
  | 'attention';

export type QueueSyncStatus = {
  state: QueueSyncState;
  queuedCount: number;
  nextRetryAt: number | null;
  oldestPendingAt: number | null;
  latestActionableError: string | null;
};

type QueueStatusEntry = {
  createdAt: number;
  updatedAt: number;
  nextRetryAt: number;
  lastError: string | null;
};

export function deriveQueueSyncStatus(
  entries: QueueStatusEntry[],
  isSyncing: boolean,
  now: number
): QueueSyncStatus {
  if (entries.length === 0) {
    return {
      state: 'idle',
      queuedCount: 0,
      nextRetryAt: null,
      oldestPendingAt: null,
      latestActionableError: null,
    };
  }

  const sortedByUpdated = [...entries].sort(
    (left, right) => left.updatedAt - right.updatedAt
  );
  const oldestPendingAt = sortedByUpdated[0]?.createdAt ?? null;

  const actionableErrors = entries
    .map((entry) =>
      entry.lastError ? getActionableSaveErrorMessage(entry.lastError) : null
    )
    .filter((message): message is string => Boolean(message));

  const nextRetryAt = entries.reduce<number | null>((next, entry) => {
    if (entry.nextRetryAt <= now) {
      return next;
    }

    if (next === null || entry.nextRetryAt < next) {
      return entry.nextRetryAt;
    }

    return next;
  }, null);

  const allBlockedByBackoff = entries.every((entry) => entry.nextRetryAt > now);

  if (isSyncing) {
    return {
      state: 'syncing',
      queuedCount: entries.length,
      nextRetryAt,
      oldestPendingAt,
      latestActionableError: actionableErrors[0] ?? null,
    };
  }

  if (actionableErrors.length > 0) {
    return {
      state: 'attention',
      queuedCount: entries.length,
      nextRetryAt,
      oldestPendingAt,
      latestActionableError: actionableErrors[0] ?? null,
    };
  }

  return {
    state: allBlockedByBackoff ? 'retrying' : 'queued',
    queuedCount: entries.length,
    nextRetryAt,
    oldestPendingAt,
    latestActionableError: null,
  };
}
