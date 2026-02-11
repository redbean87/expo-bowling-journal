import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isAllowedTransition,
  isStage,
  validateSnapshotPayloadStage,
} from '../../convex/lib/import_callback_validation';

test('isStage accepts only callback stages', () => {
  assert.equal(isStage('parsing'), true);
  assert.equal(isStage('importing'), true);
  assert.equal(isStage('completed'), true);
  assert.equal(isStage('failed'), true);
  assert.equal(isStage('queued'), false);
  assert.equal(isStage('unknown'), false);
});

test('status transition rules enforce import pipeline order', () => {
  assert.equal(isAllowedTransition('queued', 'parsing'), true);
  assert.equal(isAllowedTransition('parsing', 'importing'), true);
  assert.equal(isAllowedTransition('importing', 'completed'), true);
  assert.equal(isAllowedTransition('importing', 'failed'), true);

  assert.equal(isAllowedTransition('queued', 'importing'), false);
  assert.equal(isAllowedTransition('queued', 'completed'), false);
  assert.equal(isAllowedTransition('completed', 'parsing'), false);
  assert.equal(isAllowedTransition('failed', 'parsing'), false);
});

test('snapshot payload validation accepts snapshotJson for importing stage', () => {
  const validation = validateSnapshotPayloadStage({
    stage: 'importing',
    snapshotJson:
      '{"houses":[],"patterns":[],"balls":[],"leagues":[],"weeks":[],"games":[],"frames":[]}',
  });

  assert.equal(validation.error, null);
  assert.equal(validation.hasSnapshotJson, true);
  assert.equal(validation.hasSnapshot, false);
});

test('snapshot payload validation rejects snapshot and snapshotJson together', () => {
  const validation = validateSnapshotPayloadStage({
    stage: 'importing',
    snapshot: {},
    snapshotJson: '{}',
  });

  assert.equal(
    validation.error,
    'snapshot and snapshotJson are mutually exclusive'
  );
});

test('snapshot payload validation rejects snapshot payload on non-importing stages', () => {
  const parsingValidation = validateSnapshotPayloadStage({
    stage: 'parsing',
    snapshotJson: '{}',
  });
  assert.equal(
    parsingValidation.error,
    'snapshot payload (snapshot or snapshotJson) is only valid when stage is importing'
  );

  const completedValidation = validateSnapshotPayloadStage({
    stage: 'completed',
    snapshot: {},
  });
  assert.equal(
    completedValidation.error,
    'snapshot payload (snapshot or snapshotJson) is only valid when stage is importing'
  );
});
