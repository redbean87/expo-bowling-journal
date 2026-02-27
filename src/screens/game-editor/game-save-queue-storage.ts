import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { QueuedGameSaveEntry } from './game-save-queue';

const GAME_SAVE_QUEUE_STORAGE_KEY = 'journal:game-save-queue:v1';

function isQueuedGameSaveEntry(value: unknown): value is QueuedGameSaveEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<QueuedGameSaveEntry>;

  return (
    typeof candidate.queueId === 'string' &&
    typeof candidate.sessionId === 'string' &&
    (typeof candidate.sessionClientSyncId === 'string' ||
      candidate.sessionClientSyncId === null ||
      typeof candidate.sessionClientSyncId === 'undefined') &&
    (typeof candidate.gameId === 'string' || candidate.gameId === null) &&
    (typeof candidate.draftNonce === 'string' ||
      candidate.draftNonce === null ||
      typeof candidate.draftNonce === 'undefined') &&
    typeof candidate.date === 'string' &&
    (typeof candidate.patternId === 'string' ||
      candidate.patternId === null ||
      typeof candidate.patternId === 'undefined') &&
    (typeof candidate.ballId === 'string' ||
      candidate.ballId === null ||
      typeof candidate.ballId === 'undefined') &&
    Array.isArray(candidate.frames) &&
    typeof candidate.signature === 'string' &&
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
    return globalThis.localStorage.getItem(GAME_SAVE_QUEUE_STORAGE_KEY);
  }

  return AsyncStorage.getItem(GAME_SAVE_QUEUE_STORAGE_KEY);
}

async function setStoredValue(value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(GAME_SAVE_QUEUE_STORAGE_KEY, value);
    return;
  }

  await AsyncStorage.setItem(GAME_SAVE_QUEUE_STORAGE_KEY, value);
}

export async function loadGameSaveQueue(): Promise<QueuedGameSaveEntry[]> {
  try {
    const stored = await getStoredValue();

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isQueuedGameSaveEntry).map((entry) => ({
      ...entry,
      sessionClientSyncId:
        typeof entry.sessionClientSyncId === 'string'
          ? entry.sessionClientSyncId
          : null,
      draftNonce:
        typeof entry.draftNonce === 'string' ? entry.draftNonce : null,
      patternId: typeof entry.patternId === 'string' ? entry.patternId : null,
      ballId: typeof entry.ballId === 'string' ? entry.ballId : null,
    }));
  } catch {
    return [];
  }
}

export async function persistGameSaveQueue(entries: QueuedGameSaveEntry[]) {
  await setStoredValue(JSON.stringify(entries));
}
