type QueueSyncListener = () => void;

const listeners = new Set<QueueSyncListener>();

export function subscribeQueueSyncState(listener: QueueSyncListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function notifyQueueSyncStateChanged() {
  for (const listener of listeners) {
    listener();
  }
}
