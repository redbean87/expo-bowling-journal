import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGameSaveQueueId,
  createQueuedGameSaveEntry,
  getActionableSaveErrorMessage,
  getQueuedGameSaveEntry,
  getDueQueuedGameSaveEntries,
  isRetryableSaveError,
  markQueuedGameSaveEntryRetry,
  migrateQueuedEntryToGameId,
  removeQueuedGameSaveEntry,
  replaceQueuedGameSaveEntry,
  upsertQueuedGameSaveEntry,
} from '../../src/screens/game-editor/game-save-queue';

const BASE_TIME = 1_700_000_000_000;

function createEntry({
  sessionId,
  gameId,
  signature,
  now,
}: {
  sessionId: string;
  gameId: string | null;
  signature: string;
  now: number;
}) {
  return createQueuedGameSaveEntry(
    {
      sessionId,
      gameId,
      date: '2026-02-16',
      frames: [
        { frameNumber: 1, roll1: 10, roll2: null, roll3: null, pins: 1 },
      ],
      signature,
    },
    now
  );
}

test('buildGameSaveQueueId uses session and fallback new key', () => {
  assert.equal(buildGameSaveQueueId('session-1', null), 'session-1::new');
  assert.equal(
    buildGameSaveQueueId('session-1', null, 'draft-1'),
    'session-1::new::draft-1'
  );
  assert.equal(
    buildGameSaveQueueId('session-1', 'game-1'),
    'session-1::game-1'
  );
});

test('upsertQueuedGameSaveEntry replaces prior entry for same queue key', () => {
  const first = createEntry({
    sessionId: 'session-1',
    gameId: null,
    signature: 'one',
    now: BASE_TIME,
  });
  const second = createEntry({
    sessionId: 'session-1',
    gameId: null,
    signature: 'two',
    now: BASE_TIME + 10,
  });

  const next = upsertQueuedGameSaveEntry([first], second);

  assert.equal(next.length, 1);
  assert.equal(next[0]?.signature, 'two');
});

test('upsertQueuedGameSaveEntry keeps distinct new drafts by nonce', () => {
  const first = createQueuedGameSaveEntry(
    {
      sessionId: 'session-1',
      gameId: null,
      draftNonce: 'draft-1',
      date: '2026-02-16',
      frames: [],
      signature: 'draft-1',
    },
    BASE_TIME
  );
  const second = createQueuedGameSaveEntry(
    {
      sessionId: 'session-1',
      gameId: null,
      draftNonce: 'draft-2',
      date: '2026-02-16',
      frames: [],
      signature: 'draft-2',
    },
    BASE_TIME + 10
  );

  const next = upsertQueuedGameSaveEntry([first], second);

  assert.equal(next.length, 2);
  assert.deepEqual(next.map((entry) => entry.queueId).sort(), [
    'session-1::new::draft-1',
    'session-1::new::draft-2',
  ]);
});

test('getQueuedGameSaveEntry returns null for fresh nonce after prior draft sync', () => {
  const priorDraft = createQueuedGameSaveEntry(
    {
      sessionId: 'session-1',
      gameId: null,
      draftNonce: 'draft-old',
      date: '2026-02-16',
      frames: [],
      signature: 'prior-draft',
    },
    BASE_TIME
  );
  const migrated = migrateQueuedEntryToGameId(
    priorDraft,
    'game-1',
    BASE_TIME + 1
  );

  assert.equal(
    getQueuedGameSaveEntry([migrated], 'session-1', null, 'draft-new'),
    null
  );
});

test('getDueQueuedGameSaveEntries returns due entries oldest-updated first', () => {
  const dueOlder = {
    ...createEntry({
      sessionId: 'session-1',
      gameId: 'game-1',
      signature: 'due-older',
      now: BASE_TIME,
    }),
    updatedAt: BASE_TIME,
    nextRetryAt: BASE_TIME,
  };
  const notDue = {
    ...createEntry({
      sessionId: 'session-2',
      gameId: 'game-2',
      signature: 'not-due',
      now: BASE_TIME,
    }),
    updatedAt: BASE_TIME + 1,
    nextRetryAt: BASE_TIME + 100,
  };
  const dueNewer = {
    ...createEntry({
      sessionId: 'session-3',
      gameId: null,
      signature: 'due-newer',
      now: BASE_TIME,
    }),
    updatedAt: BASE_TIME + 2,
    nextRetryAt: BASE_TIME,
  };

  const due = getDueQueuedGameSaveEntries(
    [dueNewer, notDue, dueOlder],
    BASE_TIME
  );

  assert.deepEqual(
    due.map((entry) => entry.signature),
    ['due-older', 'due-newer']
  );
});

test('getQueuedGameSaveEntry finds session/game scoped entry', () => {
  const queuedNew = createQueuedGameSaveEntry(
    {
      sessionId: 'session-1',
      gameId: null,
      draftNonce: 'draft-a',
      date: '2026-02-16',
      frames: [],
      signature: 'queued-new',
    },
    BASE_TIME
  );
  const queuedOtherDraft = createQueuedGameSaveEntry(
    {
      sessionId: 'session-1',
      gameId: null,
      draftNonce: 'draft-b',
      date: '2026-02-16',
      frames: [],
      signature: 'queued-other-draft',
    },
    BASE_TIME
  );
  const queuedLegacyNew = createEntry({
    sessionId: 'session-1',
    gameId: null,
    signature: 'queued-legacy-new',
    now: BASE_TIME,
  });
  const queuedExisting = createEntry({
    sessionId: 'session-1',
    gameId: 'game-2',
    signature: 'queued-existing',
    now: BASE_TIME,
  });

  assert.equal(
    getQueuedGameSaveEntry(
      [queuedNew, queuedOtherDraft, queuedExisting, queuedLegacyNew],
      'session-1',
      null,
      'draft-a'
    )?.signature,
    'queued-new'
  );
  assert.equal(
    getQueuedGameSaveEntry(
      [queuedNew, queuedOtherDraft, queuedExisting, queuedLegacyNew],
      'session-1',
      null,
      'draft-b'
    )?.signature,
    'queued-other-draft'
  );
  assert.equal(
    getQueuedGameSaveEntry(
      [queuedNew, queuedOtherDraft, queuedExisting, queuedLegacyNew],
      'session-1',
      null
    )?.signature,
    'queued-legacy-new'
  );
  assert.equal(
    getQueuedGameSaveEntry(
      [queuedNew, queuedOtherDraft, queuedExisting, queuedLegacyNew],
      'session-1',
      'game-2'
    )?.signature,
    'queued-existing'
  );
  assert.equal(
    getQueuedGameSaveEntry(
      [queuedNew, queuedOtherDraft, queuedExisting, queuedLegacyNew],
      'session-2',
      null,
      'draft-a'
    ),
    null
  );
});

test('markQueuedGameSaveEntryRetry increments attempts and schedules retry', () => {
  const entry = createEntry({
    sessionId: 'session-1',
    gameId: 'game-1',
    signature: 'retry-me',
    now: BASE_TIME,
  });

  const firstRetry = markQueuedGameSaveEntryRetry(
    [entry],
    entry.queueId,
    'network error',
    BASE_TIME + 50
  );

  assert.equal(firstRetry[0]?.attemptCount, 1);
  assert.equal(firstRetry[0]?.nextRetryAt, BASE_TIME + 2050);

  const secondRetry = markQueuedGameSaveEntryRetry(
    firstRetry,
    entry.queueId,
    'network error',
    BASE_TIME + 100
  );

  assert.equal(secondRetry[0]?.attemptCount, 2);
  assert.equal(secondRetry[0]?.nextRetryAt, BASE_TIME + 5100);
});

test('migrateQueuedEntryToGameId and replaceQueuedGameSaveEntry remap queue key', () => {
  const pendingNew = createEntry({
    sessionId: 'session-1',
    gameId: null,
    signature: 'pending-new',
    now: BASE_TIME,
  });
  const migrated = migrateQueuedEntryToGameId(
    pendingNew,
    'game-99',
    BASE_TIME + 20
  );
  const replaced = replaceQueuedGameSaveEntry(
    [pendingNew],
    pendingNew.queueId,
    migrated
  );

  assert.equal(replaced.length, 1);
  assert.equal(replaced[0]?.queueId, 'session-1::game-99');
  assert.equal(replaced[0]?.gameId, 'game-99');
  assert.equal(replaced[0]?.draftNonce, null);
});

test('removeQueuedGameSaveEntry deletes matching queue id', () => {
  const entry = createEntry({
    sessionId: 'session-1',
    gameId: 'game-1',
    signature: 'remove-me',
    now: BASE_TIME,
  });
  const next = removeQueuedGameSaveEntry([entry], entry.queueId);

  assert.deepEqual(next, []);
});

test('isRetryableSaveError identifies network failures only', () => {
  assert.equal(isRetryableSaveError(new Error('Network request failed')), true);
  assert.equal(isRetryableSaveError(new Error('Failed to fetch')), true);
  assert.equal(
    isRetryableSaveError(new Error('Date is required to save.')),
    false
  );
  assert.equal(isRetryableSaveError(new Error('Game not found.')), false);
});

test('getActionableSaveErrorMessage hides retryable weak-signal failures', () => {
  assert.equal(
    getActionableSaveErrorMessage(new Error('Network request failed')),
    null
  );
});

test('getActionableSaveErrorMessage maps auth failures to sign-in guidance', () => {
  assert.equal(
    getActionableSaveErrorMessage(new Error('Unauthorized')),
    'Session expired. Sign in again to continue syncing.'
  );
});

test('getActionableSaveErrorMessage keeps validation errors actionable', () => {
  assert.equal(
    getActionableSaveErrorMessage(new Error('Date is required to save.')),
    'Date is required to save.'
  );
});

test('getActionableSaveErrorMessage uses fallback for unknown failures', () => {
  assert.equal(
    getActionableSaveErrorMessage(new Error('Unexpected server response')),
    'Unable to save game. Keep editing to retry.'
  );
});
