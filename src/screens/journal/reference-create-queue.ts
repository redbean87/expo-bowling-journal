import { isRetryableSaveError } from '../game-editor/game-save-queue';

import type { ReferenceType } from './reference-draft-id';

const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000] as const;

export type QueuedReferenceCreateEntry = {
  queueId: string;
  entityType: 'reference-create';
  referenceType: ReferenceType;
  clientSyncId: string;
  name: string;
  attemptCount: number;
  lastAttemptAt: number | null;
  nextRetryAt: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export function buildReferenceCreateQueueId(
  referenceType: ReferenceType,
  clientSyncId: string
) {
  return `reference-create::${referenceType}::${clientSyncId}`;
}

export function createQueuedReferenceCreateEntry({
  referenceType,
  clientSyncId,
  name,
  now,
}: {
  referenceType: ReferenceType;
  clientSyncId: string;
  name: string;
  now: number;
}): QueuedReferenceCreateEntry {
  return {
    queueId: buildReferenceCreateQueueId(referenceType, clientSyncId),
    entityType: 'reference-create',
    referenceType,
    clientSyncId,
    name,
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

function resetRetryState(
  entry: QueuedReferenceCreateEntry,
  now: number
): QueuedReferenceCreateEntry {
  return {
    ...entry,
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: now,
    lastError: null,
    updatedAt: now,
  };
}

export function upsertQueuedReferenceCreateEntry(
  entries: QueuedReferenceCreateEntry[],
  entry: QueuedReferenceCreateEntry
) {
  const now = Date.now();
  const next = entries.filter(
    (candidate) => candidate.queueId !== entry.queueId
  );
  next.push(resetRetryState(entry, now));
  return next;
}

export function removeQueuedReferenceCreateEntry(
  entries: QueuedReferenceCreateEntry[],
  queueId: string
) {
  return entries.filter((entry) => entry.queueId !== queueId);
}

export function markQueuedReferenceCreateEntryRetry(
  entries: QueuedReferenceCreateEntry[],
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
    };
  });
}

export function getDueQueuedReferenceCreateEntries(
  entries: QueuedReferenceCreateEntry[],
  now: number
) {
  return entries
    .filter((entry) => entry.nextRetryAt <= now)
    .sort((left, right) => left.updatedAt - right.updatedAt);
}

export function isRetryableReferenceCreateError(caught: unknown) {
  return isRetryableSaveError(caught);
}
