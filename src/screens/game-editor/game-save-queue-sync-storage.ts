import type { QueuedGameSaveEntry } from './game-save-queue';

export async function loadDefaultQueue() {
  const module = await import('./game-save-queue-storage');
  return module.loadGameSaveQueue();
}

export async function persistDefaultQueue(entries: QueuedGameSaveEntry[]) {
  const module = await import('./game-save-queue-storage');
  await module.persistGameSaveQueue(entries);
}

export async function loadJournalSyncMapDefault() {
  const module = await import('../journal/journal-client-sync-map-storage');
  return module.loadJournalClientSyncMap();
}

export function getErrorMessage(caught: unknown) {
  if (caught instanceof Error) {
    return caught.message;
  }

  return 'Unable to sync saved game.';
}

export function getEntryByQueueId(
  entries: QueuedGameSaveEntry[],
  queueId: string
) {
  return entries.find((entry) => entry.queueId === queueId) ?? null;
}

export function removeQueuedEntryIfSignatureMatches(
  entries: QueuedGameSaveEntry[],
  queueId: string,
  signature: string
) {
  return entries.filter(
    (entry) => !(entry.queueId === queueId && entry.signature === signature)
  );
}

export async function applyQueueMutation(
  loadQueue: () => Promise<QueuedGameSaveEntry[]>,
  persistQueue: (entries: QueuedGameSaveEntry[]) => Promise<void>,
  mutate: (entries: QueuedGameSaveEntry[]) => QueuedGameSaveEntry[]
) {
  const latestEntries = await loadQueue();
  const nextEntries = mutate(latestEntries);
  await persistQueue(nextEntries);
  return nextEntries;
}
