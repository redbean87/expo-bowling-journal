import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createQueuedGameSaveEntry,
  markQueuedGameSaveEntryRetry,
} from '../../src/screens/game-editor/game-save-queue';
import { deriveQueueSyncStatus } from '../../src/screens/game-editor/game-save-queue-status';

const BASE_TIME = 1_700_000_000_000;

test('deriveQueueSyncStatus returns idle when queue is empty', () => {
  const status = deriveQueueSyncStatus([], false, BASE_TIME);

  assert.equal(status.state, 'idle');
  assert.equal(status.queuedCount, 0);
});

test('deriveQueueSyncStatus returns syncing when queue has entries in-flight', () => {
  const entry = createQueuedGameSaveEntry(
    {
      sessionId: 'session-1',
      gameId: 'game-1',
      date: '2026-02-20',
      frames: [],
      signature: 'sig-1',
    },
    BASE_TIME
  );

  const status = deriveQueueSyncStatus([entry], true, BASE_TIME);

  assert.equal(status.state, 'syncing');
  assert.equal(status.queuedCount, 1);
});

test('deriveQueueSyncStatus returns retrying when entries are in backoff', () => {
  const entry = createQueuedGameSaveEntry(
    {
      sessionId: 'session-1',
      gameId: 'game-1',
      date: '2026-02-20',
      frames: [],
      signature: 'sig-1',
    },
    BASE_TIME
  );

  const [backoffEntry] = markQueuedGameSaveEntryRetry(
    [entry],
    entry.queueId,
    'Network request failed',
    BASE_TIME
  );

  const status = deriveQueueSyncStatus([backoffEntry], false, BASE_TIME + 1000);

  assert.equal(status.state, 'retrying');
});

test('deriveQueueSyncStatus returns attention for actionable errors', () => {
  const entry = createQueuedGameSaveEntry(
    {
      sessionId: 'session-1',
      gameId: 'game-1',
      date: '2026-02-20',
      frames: [],
      signature: 'sig-1',
    },
    BASE_TIME
  );

  const [next] = markQueuedGameSaveEntryRetry(
    [entry],
    entry.queueId,
    'Unauthorized',
    BASE_TIME
  );

  const status = deriveQueueSyncStatus([next], false, BASE_TIME + 1000);

  assert.equal(status.state, 'attention');
  assert.equal(
    status.latestActionableError,
    'Session expired. Sign in again to continue syncing.'
  );
});
