import {
  flushQueuedGameSavesCore,
  type FlushQueuedGameSavesOptions,
  type FlushQueuedGameSavesResult,
} from './game-save-queue-sync-core';
import {
  loadDefaultQueue,
  persistDefaultQueue,
} from './game-save-queue-sync-storage';

let queueFlushInFlight: Promise<FlushQueuedGameSavesResult> | null = null;

type PublicFlushQueuedGameSavesOptions = Omit<
  FlushQueuedGameSavesOptions,
  'loadQueue' | 'persistQueue'
> & {
  loadQueue?: FlushQueuedGameSavesOptions['loadQueue'];
  persistQueue?: FlushQueuedGameSavesOptions['persistQueue'];
};

export async function flushQueuedGameSaves({
  loadQueue = loadDefaultQueue,
  persistQueue = persistDefaultQueue,
  ...rest
}: PublicFlushQueuedGameSavesOptions): Promise<FlushQueuedGameSavesResult> {
  return flushQueuedGameSavesCore({
    ...rest,
    loadQueue,
    persistQueue,
  });
}

export function isQueuedGameSaveFlushInFlight() {
  return queueFlushInFlight !== null;
}

export function flushQueuedGameSavesWithLock({
  loadQueue = loadDefaultQueue,
  persistQueue = persistDefaultQueue,
  ...rest
}: PublicFlushQueuedGameSavesOptions) {
  if (queueFlushInFlight) {
    return queueFlushInFlight;
  }

  queueFlushInFlight = flushQueuedGameSavesCore({
    ...rest,
    loadQueue,
    persistQueue,
  }).finally(() => {
    queueFlushInFlight = null;
  });

  return queueFlushInFlight;
}
