import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { QueuedReferenceCreateEntry } from './reference-create-queue';
import type { ReferenceType } from './reference-draft-id';

const REFERENCE_CREATE_QUEUE_STORAGE_KEY = 'journal:reference-create-queue:v1';

function isReferenceType(value: unknown): value is ReferenceType {
  return value === 'house' || value === 'pattern' || value === 'ball';
}

function isQueuedReferenceCreateEntry(
  value: unknown
): value is QueuedReferenceCreateEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<QueuedReferenceCreateEntry>;

  return (
    typeof candidate.queueId === 'string' &&
    candidate.entityType === 'reference-create' &&
    isReferenceType(candidate.referenceType) &&
    typeof candidate.clientSyncId === 'string' &&
    typeof candidate.name === 'string' &&
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
    return globalThis.localStorage.getItem(REFERENCE_CREATE_QUEUE_STORAGE_KEY);
  }

  return AsyncStorage.getItem(REFERENCE_CREATE_QUEUE_STORAGE_KEY);
}

async function setStoredValue(value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(REFERENCE_CREATE_QUEUE_STORAGE_KEY, value);
    return;
  }

  await AsyncStorage.setItem(REFERENCE_CREATE_QUEUE_STORAGE_KEY, value);
}

export async function loadReferenceCreateQueue(): Promise<
  QueuedReferenceCreateEntry[]
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

    return parsed.filter(isQueuedReferenceCreateEntry);
  } catch {
    return [];
  }
}

export async function persistReferenceCreateQueue(
  entries: QueuedReferenceCreateEntry[]
) {
  await setStoredValue(JSON.stringify(entries));
}
