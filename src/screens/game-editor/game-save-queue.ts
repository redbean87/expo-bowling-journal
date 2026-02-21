import type { EditableFrameInput } from '@/services/journal';

const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000] as const;

export type QueuedGameSaveEntry = {
  queueId: string;
  sessionId: string;
  gameId: string | null;
  draftNonce: string | null;
  date: string;
  frames: EditableFrameInput[];
  signature: string;
  attemptCount: number;
  lastAttemptAt: number | null;
  nextRetryAt: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

type NewQueuedGameSaveInput = {
  sessionId: string;
  gameId: string | null;
  draftNonce?: string | null;
  date: string;
  frames: EditableFrameInput[];
  signature: string;
};

function normalizeDraftNonce(draftNonce?: string | null) {
  if (!draftNonce) {
    return null;
  }

  const trimmed = draftNonce.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildGameSaveQueueId(
  sessionId: string,
  gameId: string | null,
  draftNonce?: string | null
) {
  if (gameId) {
    return `${sessionId}::${gameId}`;
  }

  const normalizedDraftNonce = normalizeDraftNonce(draftNonce);

  if (normalizedDraftNonce) {
    return `${sessionId}::new::${normalizedDraftNonce}`;
  }

  return `${sessionId}::new`;
}

export function createQueuedGameSaveEntry(
  input: NewQueuedGameSaveInput,
  now: number
): QueuedGameSaveEntry {
  const normalizedDraftNonce = normalizeDraftNonce(input.draftNonce);

  return {
    queueId: buildGameSaveQueueId(
      input.sessionId,
      input.gameId,
      normalizedDraftNonce
    ),
    sessionId: input.sessionId,
    gameId: input.gameId,
    draftNonce: input.gameId ? null : normalizedDraftNonce,
    date: input.date,
    frames: input.frames,
    signature: input.signature,
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertQueuedGameSaveEntry(
  entries: QueuedGameSaveEntry[],
  entry: QueuedGameSaveEntry
): QueuedGameSaveEntry[] {
  const next = entries.filter((item) => item.queueId !== entry.queueId);
  next.push(entry);
  return next;
}

export function replaceQueuedGameSaveEntry(
  entries: QueuedGameSaveEntry[],
  previousQueueId: string,
  entry: QueuedGameSaveEntry
): QueuedGameSaveEntry[] {
  return upsertQueuedGameSaveEntry(
    entries.filter((item) => item.queueId !== previousQueueId),
    entry
  );
}

export function removeQueuedGameSaveEntry(
  entries: QueuedGameSaveEntry[],
  queueId: string
): QueuedGameSaveEntry[] {
  return entries.filter((entry) => entry.queueId !== queueId);
}

export function getDueQueuedGameSaveEntries(
  entries: QueuedGameSaveEntry[],
  now: number
): QueuedGameSaveEntry[] {
  return entries
    .filter((entry) => entry.nextRetryAt <= now)
    .sort((left, right) => left.updatedAt - right.updatedAt);
}

export function getQueuedGameSaveEntry(
  entries: QueuedGameSaveEntry[],
  sessionId: string,
  gameId: string | null,
  draftNonce?: string | null
) {
  const queueId = buildGameSaveQueueId(sessionId, gameId, draftNonce);
  return entries.find((entry) => entry.queueId === queueId) ?? null;
}

export function migrateQueuedEntryToGameId(
  entry: QueuedGameSaveEntry,
  gameId: string,
  now: number
): QueuedGameSaveEntry {
  return {
    ...entry,
    gameId,
    draftNonce: null,
    queueId: buildGameSaveQueueId(entry.sessionId, gameId),
    updatedAt: now,
  };
}

export function markQueuedGameSaveEntryRetry(
  entries: QueuedGameSaveEntry[],
  queueId: string,
  errorMessage: string,
  now: number
): QueuedGameSaveEntry[] {
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

export function isRetryableSaveError(caught: unknown): boolean {
  const message = getSaveErrorMessage(caught);

  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();

  if (
    normalized.includes('required') ||
    normalized.includes('invalid') ||
    normalized.includes('not found') ||
    normalized.includes('must ') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden')
  ) {
    return false;
  }

  return (
    normalized.includes('network') ||
    normalized.includes('offline') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('fetch failed') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout') ||
    normalized.includes('connection') ||
    normalized.includes('econn') ||
    normalized.includes('temporarily unavailable')
  );
}

function getSaveErrorMessage(caught: unknown): string {
  if (caught instanceof Error) {
    return caught.message;
  }

  if (typeof caught === 'string') {
    return caught;
  }

  return '';
}

export function getActionableSaveErrorMessage(caught: unknown): string | null {
  const message = getSaveErrorMessage(caught).trim();

  if (message.length === 0) {
    return 'Unable to save game. Keep editing to retry.';
  }

  const normalized = message.toLowerCase();

  if (isRetryableSaveError(caught)) {
    return null;
  }

  if (
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden') ||
    normalized.includes('token') ||
    normalized.includes('auth') ||
    normalized.includes('sign in') ||
    normalized.includes('sign-in')
  ) {
    return 'Session expired. Sign in again to continue syncing.';
  }

  if (
    normalized.includes('required') ||
    normalized.includes('invalid') ||
    normalized.includes('must ') ||
    normalized.includes('not found')
  ) {
    return message;
  }

  return 'Unable to save game. Keep editing to retry.';
}
