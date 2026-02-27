import assert from 'node:assert/strict';
import test from 'node:test';

import {
  didRestoreConnectivity,
  loadQueueSyncPresence,
  shouldRunQueueSyncInterval,
} from '../../src/screens/journal/queue-sync-presence';

test('loadQueueSyncPresence computes totals from all queue loaders', async () => {
  const snapshot = await loadQueueSyncPresence({
    loadGameQueue: async () =>
      [
        {
          queueId: 'g1',
        },
      ] as never,
    loadJournalQueue: async () =>
      [
        {
          queueId: 'j1',
        },
        {
          queueId: 'j2',
        },
      ] as never,
    loadReferenceQueue: async () => [] as never,
  });

  assert.equal(snapshot.gameSaveEntries, 1);
  assert.equal(snapshot.journalCreateEntries, 2);
  assert.equal(snapshot.referenceCreateEntries, 0);
  assert.equal(snapshot.totalEntries, 3);
  assert.equal(snapshot.hasPendingEntries, true);
});

test('loadQueueSyncPresence reports no pending entries when all queues are empty', async () => {
  const snapshot = await loadQueueSyncPresence({
    loadGameQueue: async () => [] as never,
    loadJournalQueue: async () => [] as never,
    loadReferenceQueue: async () => [] as never,
  });

  assert.equal(snapshot.totalEntries, 0);
  assert.equal(snapshot.hasPendingEntries, false);
});

test('shouldRunQueueSyncInterval requires active, online, and pending entries', () => {
  assert.equal(
    shouldRunQueueSyncInterval({
      isAppActive: true,
      isOnline: true,
      hasPendingEntries: true,
    }),
    true
  );
  assert.equal(
    shouldRunQueueSyncInterval({
      isAppActive: false,
      isOnline: true,
      hasPendingEntries: true,
    }),
    false
  );
  assert.equal(
    shouldRunQueueSyncInterval({
      isAppActive: true,
      isOnline: false,
      hasPendingEntries: true,
    }),
    false
  );
  assert.equal(
    shouldRunQueueSyncInterval({
      isAppActive: true,
      isOnline: true,
      hasPendingEntries: false,
    }),
    false
  );
});

test('didRestoreConnectivity only returns true for offline to online transition', () => {
  assert.equal(
    didRestoreConnectivity({ previousOnline: false, nextOnline: true }),
    true
  );
  assert.equal(
    didRestoreConnectivity({ previousOnline: true, nextOnline: true }),
    false
  );
  assert.equal(
    didRestoreConnectivity({ previousOnline: true, nextOnline: false }),
    false
  );
});
