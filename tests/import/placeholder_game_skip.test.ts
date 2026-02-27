import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldSkipPlaceholderGameRow } from '../../convex/lib/import_core_runner';

test('skips placeholder game rows with zero score and no populated frames', () => {
  const shouldSkip = shouldSkipPlaceholderGameRow({
    row: {
      sqliteId: 10,
      score: 0,
      notes: null,
      lane: null,
    },
    rawFrames: [{ flags: 0 }, { flags: 0 }],
    extension: undefined,
  });

  assert.equal(shouldSkip, true);
});

test('does not skip zero-score games when populated frame rows exist', () => {
  const shouldSkip = shouldSkipPlaceholderGameRow({
    row: {
      sqliteId: 11,
      score: 0,
      notes: null,
      lane: null,
    },
    rawFrames: [{ flags: 193 }, { flags: 195 }],
    extension: undefined,
  });

  assert.equal(shouldSkip, false);
});

test('does not skip placeholder-shaped rows when extension metadata exists', () => {
  const shouldSkip = shouldSkipPlaceholderGameRow({
    row: {
      sqliteId: 12,
      score: 0,
      notes: null,
      lane: null,
    },
    rawFrames: [{ flags: 0 }, { flags: 0 }],
    extension: {
      notesJson: '"No score entered due to injury"',
    },
  });

  assert.equal(shouldSkip, false);
});
