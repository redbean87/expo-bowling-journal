import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDraftReferenceId,
  parseDraftReferenceId,
  resolveReferenceIdFromSyncMap,
} from '../../src/screens/journal/reference-draft-id';

test('buildDraftReferenceId and parseDraftReferenceId round-trip', () => {
  const draftId = buildDraftReferenceId('house', 'house-client-1');
  assert.equal(draftId, 'draft-house-house-client-1');
  assert.deepEqual(parseDraftReferenceId(draftId), {
    referenceType: 'house',
    clientSyncId: 'house-client-1',
  });
});

test('parseDraftReferenceId ignores non-draft ids', () => {
  assert.equal(parseDraftReferenceId('k1x2y3z4'), null);
});

test('resolveReferenceIdFromSyncMap keeps non-draft ids untouched', () => {
  const resolution = resolveReferenceIdFromSyncMap('k1x2y3z4', {
    leagues: {},
    sessions: {},
    houses: {},
    patterns: {},
    balls: {},
  });

  assert.equal(resolution.resolvedId, 'k1x2y3z4');
  assert.equal(resolution.pendingDraftReference, null);
});

test('resolveReferenceIdFromSyncMap resolves mapped draft ids', () => {
  const resolution = resolveReferenceIdFromSyncMap(
    'draft-pattern-pattern-client-1',
    {
      leagues: {},
      sessions: {},
      houses: {},
      patterns: {
        'pattern-client-1': 'pattern-server-1',
      },
      balls: {},
    }
  );

  assert.equal(resolution.resolvedId, 'pattern-server-1');
  assert.equal(resolution.pendingDraftReference, null);
});

test('resolveReferenceIdFromSyncMap reports pending draft ids without mappings', () => {
  const resolution = resolveReferenceIdFromSyncMap('draft-ball-ball-client-1', {
    leagues: {},
    sessions: {},
    houses: {},
    patterns: {},
    balls: {},
  });

  assert.equal(resolution.resolvedId, null);
  assert.deepEqual(resolution.pendingDraftReference, {
    referenceType: 'ball',
    clientSyncId: 'ball-client-1',
  });
});
