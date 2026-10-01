// Mount-tracking test double for '@/providers/game-save-queue-syncer' used by
// the D2 navigation tests. Each render of the layout that mounts the syncer
// records one entry; the real queue sync implementation is not exercised here.
export const syncerMounts = [];

export function GameSaveQueueSyncer() {
  syncerMounts.push('mounted');

  return null;
}
