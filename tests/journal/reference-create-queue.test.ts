import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReferenceCreateQueueId,
  createQueuedReferenceCreateEntry,
  markQueuedReferenceCreateEntryRetry,
  removeQueuedReferenceCreateEntry,
  upsertQueuedReferenceCreateEntry,
} from '../../src/screens/journal/reference-create-queue';

const BASE_TIME = 1_700_000_000_000;

test('buildReferenceCreateQueueId scopes by reference type + client sync id', () => {
  assert.equal(
    buildReferenceCreateQueueId('house', 'house-client-1'),
    'reference-create::house::house-client-1'
  );
  assert.equal(
    buildReferenceCreateQueueId('pattern', 'pattern-client-1'),
    'reference-create::pattern::pattern-client-1'
  );
});

test('upsertQueuedReferenceCreateEntry keeps latest local edit for same draft id', () => {
  const first = createQueuedReferenceCreateEntry({
    referenceType: 'ball',
    clientSyncId: 'ball-client-1',
    name: 'Summit',
    now: BASE_TIME,
  });
  const second = createQueuedReferenceCreateEntry({
    referenceType: 'ball',
    clientSyncId: 'ball-client-1',
    name: 'Summit Peak',
    now: BASE_TIME + 100,
  });

  const merged = upsertQueuedReferenceCreateEntry([first], second);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.name, 'Summit Peak');
  assert.equal(merged[0]?.attemptCount, 0);
  assert.equal(merged[0]?.lastError, null);
});

test('markQueuedReferenceCreateEntryRetry applies backoff and error details', () => {
  const entry = createQueuedReferenceCreateEntry({
    referenceType: 'pattern',
    clientSyncId: 'pattern-client-1',
    name: 'Kegel 42',
    now: BASE_TIME,
  });

  const retried = markQueuedReferenceCreateEntryRetry(
    [entry],
    entry.queueId,
    'Network request failed',
    BASE_TIME + 25
  );

  assert.equal(retried[0]?.attemptCount, 1);
  assert.equal(retried[0]?.lastError, 'Network request failed');
  assert.equal(retried[0]?.nextRetryAt, BASE_TIME + 2025);
});

test('removeQueuedReferenceCreateEntry removes matching queued draft', () => {
  const entry = createQueuedReferenceCreateEntry({
    referenceType: 'house',
    clientSyncId: 'house-client-1',
    name: 'Sunset Lanes',
    now: BASE_TIME,
  });

  assert.deepEqual(
    removeQueuedReferenceCreateEntry([entry], entry.queueId),
    []
  );
});
