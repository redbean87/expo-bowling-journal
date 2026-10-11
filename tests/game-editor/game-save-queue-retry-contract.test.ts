import assert from 'node:assert/strict';
import test from 'node:test';

import { isRetryableSaveError } from '../../src/screens/game-editor/game-save-queue';

// The hybrid rejection shape below is the only mutation-rejection shape the
// installed Convex SDK (1.32.0) produces. It is established from source
// inspection of node_modules/convex (client.js, logging.js), NOT from a
// captured runtime failure on any platform.
function convexMutationError(udfPath: string, serverMessage: string): Error {
  return new Error(
    `[CONVEX M(${udfPath})] ${serverMessage}\n  Called by client`
  );
}

test('mutation failures without a permanent signal are retryable', () => {
  assert.equal(
    isRetryableSaveError(
      convexMutationError('games.create', 'Unknown server error')
    ),
    true
  );
  assert.equal(
    isRetryableSaveError(
      convexMutationError('frames.replaceForGame', 'Something went wrong')
    ),
    true
  );
  assert.equal(
    isRetryableSaveError(new Error('Unexpected server response')),
    true
  );
  assert.equal(
    isRetryableSaveError(new Error('AsyncStorage write failed: disk full')),
    true
  );
});

test('network-shaped failures remain retryable', () => {
  assert.equal(isRetryableSaveError(new Error('Network request failed')), true);
  assert.equal(isRetryableSaveError(new Error('Failed to fetch')), true);
  assert.equal(isRetryableSaveError(new Error('ECONNREFUSED')), true);
  assert.equal(isRetryableSaveError(new Error('Request timed out')), true);
  assert.equal(
    isRetryableSaveError(new Error('Connection reset by peer')),
    true
  );
});

test('empty or unknown error values are retryable', () => {
  assert.equal(isRetryableSaveError(new Error('')), true);
  assert.equal(isRetryableSaveError(''), true);
  assert.equal(isRetryableSaveError(null), true);
  assert.equal(isRetryableSaveError(undefined), true);
});

test('demonstrably permanent failures stay permanent', () => {
  assert.equal(
    isRetryableSaveError(
      convexMutationError('games.create', 'Session not found')
    ),
    false
  );
  assert.equal(
    isRetryableSaveError(new Error('Date is required to save.')),
    false
  );
  assert.equal(isRetryableSaveError(new Error('Game not found.')), false);
  assert.equal(
    isRetryableSaveError(new Error('Pattern name is required')),
    false
  );
  assert.equal(isRetryableSaveError(new Error('Invalid argument')), false);
  assert.equal(isRetryableSaveError(new Error('Unauthorized')), false);
  assert.equal(isRetryableSaveError(new Error('Forbidden')), false);
});
