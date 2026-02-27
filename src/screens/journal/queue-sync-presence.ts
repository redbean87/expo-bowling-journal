export type QueueSyncPresence = {
  gameSaveEntries: number;
  journalCreateEntries: number;
  referenceCreateEntries: number;
  totalEntries: number;
  hasPendingEntries: boolean;
};

type QueueSyncLoaders = {
  loadGameQueue?: () => Promise<unknown[]>;
  loadJournalQueue?: () => Promise<unknown[]>;
  loadReferenceQueue?: () => Promise<unknown[]>;
};

async function loadGameQueueDefault() {
  const module = await import('../game-editor/game-save-queue-storage');
  return module.loadGameSaveQueue();
}

async function loadJournalQueueDefault() {
  const module = await import('./journal-create-queue-storage');
  return module.loadJournalCreateQueue();
}

async function loadReferenceQueueDefault() {
  const module = await import('./reference-create-queue-storage');
  return module.loadReferenceCreateQueue();
}

export async function loadQueueSyncPresence({
  loadGameQueue = loadGameQueueDefault,
  loadJournalQueue = loadJournalQueueDefault,
  loadReferenceQueue = loadReferenceQueueDefault,
}: QueueSyncLoaders = {}): Promise<QueueSyncPresence> {
  const [gameEntries, journalEntries, referenceEntries] = await Promise.all([
    loadGameQueue(),
    loadJournalQueue(),
    loadReferenceQueue(),
  ]);

  const gameSaveEntries = gameEntries.length;
  const journalCreateEntries = journalEntries.length;
  const referenceCreateEntries = referenceEntries.length;
  const totalEntries =
    gameSaveEntries + journalCreateEntries + referenceCreateEntries;

  return {
    gameSaveEntries,
    journalCreateEntries,
    referenceCreateEntries,
    totalEntries,
    hasPendingEntries: totalEntries > 0,
  };
}

export function shouldRunQueueSyncInterval({
  isAppActive,
  isOnline,
  hasPendingEntries,
}: {
  isAppActive: boolean;
  isOnline: boolean;
  hasPendingEntries: boolean;
}) {
  return isAppActive && isOnline && hasPendingEntries;
}

export function didRestoreConnectivity({
  previousOnline,
  nextOnline,
}: {
  previousOnline: boolean;
  nextOnline: boolean;
}) {
  return previousOnline === false && nextOnline === true;
}
