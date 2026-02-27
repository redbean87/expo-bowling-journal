import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { QueuedJournalCreateEntry } from './journal-create-queue';

const JOURNAL_CREATE_QUEUE_STORAGE_KEY = 'journal:create-queue:v1';

function isQueueEntry(value: unknown): value is QueuedJournalCreateEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<QueuedJournalCreateEntry>;

  const isKnownEntityType =
    candidate.entityType === 'league-create' ||
    candidate.entityType === 'league-update' ||
    candidate.entityType === 'league-delete' ||
    candidate.entityType === 'session-create' ||
    candidate.entityType === 'session-update' ||
    candidate.entityType === 'session-delete';

  return (
    typeof candidate.queueId === 'string' &&
    isKnownEntityType &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null &&
    typeof candidate.attemptCount === 'number' &&
    (typeof candidate.lastAttemptAt === 'number' ||
      candidate.lastAttemptAt === null) &&
    typeof candidate.nextRetryAt === 'number' &&
    (typeof candidate.lastError === 'string' || candidate.lastError === null) &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number'
  );
}

async function getStoredValue() {
  if (Platform.OS === 'web') {
    return globalThis.localStorage.getItem(JOURNAL_CREATE_QUEUE_STORAGE_KEY);
  }

  return AsyncStorage.getItem(JOURNAL_CREATE_QUEUE_STORAGE_KEY);
}

async function setStoredValue(value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(JOURNAL_CREATE_QUEUE_STORAGE_KEY, value);
    return;
  }

  await AsyncStorage.setItem(JOURNAL_CREATE_QUEUE_STORAGE_KEY, value);
}

export async function loadJournalCreateQueue(): Promise<
  QueuedJournalCreateEntry[]
> {
  try {
    const stored = await getStoredValue();

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isQueueEntry);
  } catch {
    return [];
  }
}

export async function persistJournalCreateQueue(
  entries: QueuedJournalCreateEntry[]
) {
  await setStoredValue(JSON.stringify(entries));
}
