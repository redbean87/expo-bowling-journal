import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createQueuedGameSaveEntry,
  type QueuedGameSaveEntry,
} from '../../src/screens/game-editor/game-save-queue';
import {
  flushQueuedGameSaves,
  flushQueuedGameSavesWithLock,
} from '../../src/screens/game-editor/game-save-queue-sync';

const BASE_TIME = 1_700_000_000_000;

function createQueueEntry(overrides?: Partial<QueuedGameSaveEntry>) {
  const base = createQueuedGameSaveEntry(
    {
      sessionId: 'session-1',
      gameId: 'game-1',
      date: '2026-02-19',
      frames: [
        { frameNumber: 1, roll1: 10, roll2: null, roll3: null, pins: 1 },
      ],
      signature: 'sig-1',
    },
    BASE_TIME
  );

  return {
    ...base,
    ...overrides,
  };
}

test('flushQueuedGameSavesWithLock reuses in-flight queue flush', async () => {
  let loadCalls = 0;
  let resolveGate: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    resolveGate = () => resolve();
  });

  const loadQueue = async () => {
    loadCalls += 1;
    await gate;
    return [];
  };

  const first = flushQueuedGameSavesWithLock({
    createGame: async () => 'game-1' as never,
    updateGame: async () => undefined,
    replaceFramesForGame: async () => undefined,
    loadQueue,
    persistQueue: async () => undefined,
  });
  const second = flushQueuedGameSavesWithLock({
    createGame: async () => 'game-1' as never,
    updateGame: async () => undefined,
    replaceFramesForGame: async () => undefined,
    loadQueue,
    persistQueue: async () => undefined,
  });

  assert.equal(first, second);

  if (!resolveGate) {
    throw new Error('Expected release callback to be set.');
  }

  resolveGate();
  await Promise.all([first, second]);
  assert.equal(loadCalls, 1);
});

test('flushQueuedGameSaves creates missing game ids and removes synced entries', async () => {
  const createdEntry = createQueueEntry({
    gameId: null,
    queueId: 'session-1::new',
    nextRetryAt: BASE_TIME,
  });
  let queueState: QueuedGameSaveEntry[] = [createdEntry];
  let syncedTargetGameId: string | null = null;

  await flushQueuedGameSaves({
    createGame: async () => 'game-created' as never,
    updateGame: async () => undefined,
    replaceFramesForGame: async () => undefined,
    loadQueue: async () => queueState,
    persistQueue: async (entries) => {
      queueState = entries;
    },
    onEntrySynced: ({ targetGameId, wasCreated }) => {
      assert.equal(wasCreated, true);
      syncedTargetGameId = targetGameId;
    },
  });

  assert.equal(syncedTargetGameId, 'game-created');
  assert.deepEqual(queueState, []);
});

test('flushQueuedGameSaves retries transient sync errors', async () => {
  const dueEntry = createQueueEntry({ nextRetryAt: BASE_TIME });
  let queueState: QueuedGameSaveEntry[] = [dueEntry];

  await flushQueuedGameSaves({
    createGame: async () => {
      throw new Error('unexpected create');
    },
    updateGame: async () => {
      throw new Error('Network request failed');
    },
    replaceFramesForGame: async () => undefined,
    loadQueue: async () => queueState,
    persistQueue: async (entries) => {
      queueState = entries;
    },
  });

  assert.equal(queueState.length, 1);
  assert.equal(queueState[0]?.attemptCount, 1);
  assert.equal(queueState[0]?.lastError, 'Network request failed');
});

test('flushQueuedGameSaves removes non-retryable errors and reports callback', async () => {
  const dueEntry = createQueueEntry({ nextRetryAt: BASE_TIME });
  let queueState: QueuedGameSaveEntry[] = [dueEntry];
  let callbackQueueId: string | null = null;

  await flushQueuedGameSaves({
    createGame: async () => {
      throw new Error('unexpected create');
    },
    updateGame: async () => {
      throw new Error('Game not found.');
    },
    replaceFramesForGame: async () => undefined,
    loadQueue: async () => queueState,
    persistQueue: async (entries) => {
      queueState = entries;
    },
    onEntryFailedNonRetryable: ({ originalQueueId }) => {
      callbackQueueId = originalQueueId;
    },
  });

  assert.deepEqual(queueState, []);
  assert.equal(callbackQueueId, dueEntry.queueId);
});

test('flushQueuedGameSaves force option processes backoff entries immediately', async () => {
  const futureEntry = createQueueEntry({ nextRetryAt: BASE_TIME + 60_000 });
  let queueState: QueuedGameSaveEntry[] = [futureEntry];
  let synced = false;

  await flushQueuedGameSaves({
    createGame: async () => {
      throw new Error('unexpected create');
    },
    updateGame: async () => undefined,
    replaceFramesForGame: async () => undefined,
    loadQueue: async () => queueState,
    persistQueue: async (entries) => {
      queueState = entries;
    },
    onEntrySynced: () => {
      synced = true;
    },
    force: true,
  });

  assert.equal(synced, true);
  assert.deepEqual(queueState, []);
});

test('flushQueuedGameSaves preserves newer queued frames on retry write', async () => {
  const dueEntry = createQueueEntry({
    nextRetryAt: BASE_TIME,
    signature: 'old-signature',
    frames: [
      { frameNumber: 1, roll1: 10, roll2: null, roll3: null, pins: 1 },
      { frameNumber: 2, roll1: 8, roll2: 1, roll3: null, pins: 2 },
    ],
  });
  const newerEntry = {
    ...dueEntry,
    signature: 'new-signature',
    updatedAt: BASE_TIME + 50,
    frames: [
      { frameNumber: 1, roll1: 10, roll2: null, roll3: null, pins: 1 },
      { frameNumber: 2, roll1: 9, roll2: 1, roll3: null, pins: 2 },
      { frameNumber: 3, roll1: 10, roll2: null, roll3: null, pins: 3 },
    ],
  };
  let queueState: QueuedGameSaveEntry[] = [dueEntry];

  await flushQueuedGameSaves({
    createGame: async () => {
      throw new Error('unexpected create');
    },
    updateGame: async () => {
      queueState = [newerEntry];
      throw new Error('Network request failed');
    },
    replaceFramesForGame: async () => undefined,
    loadQueue: async () => queueState,
    persistQueue: async (entries) => {
      queueState = entries;
    },
  });

  assert.equal(queueState.length, 1);
  assert.equal(queueState[0]?.signature, 'new-signature');
  assert.equal(queueState[0]?.frames.length, 3);
  assert.equal(queueState[0]?.attemptCount, 1);
});

test('flushQueuedGameSaves does not remove newer replacement after successful sync', async () => {
  const dueEntry = createQueueEntry({
    nextRetryAt: BASE_TIME,
    signature: 'old-signature',
  });
  const newerEntry = {
    ...dueEntry,
    signature: 'new-signature',
    updatedAt: BASE_TIME + 10,
  };
  let queueState: QueuedGameSaveEntry[] = [dueEntry];

  await flushQueuedGameSaves({
    createGame: async () => {
      throw new Error('unexpected create');
    },
    updateGame: async () => undefined,
    replaceFramesForGame: async () => {
      queueState = [newerEntry];
    },
    loadQueue: async () => queueState,
    persistQueue: async (entries) => {
      queueState = entries;
    },
  });

  assert.equal(queueState.length, 1);
  assert.equal(queueState[0]?.signature, 'new-signature');
});
