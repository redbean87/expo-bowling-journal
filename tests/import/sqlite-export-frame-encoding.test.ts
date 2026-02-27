import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countLegacyRowsForGameFrames,
  frameHasSpare,
  packPinsFromRolls,
  toLegacyPackedPins,
} from '../../convex/lib/sqlite_export_frame_encoding';

test('toLegacyPackedPins keeps legacy values unchanged', () => {
  const legacyPins = 65600;
  assert.equal(toLegacyPackedPins(legacyPins), legacyPins);
});

test('toLegacyPackedPins converts manual-packed marker values', () => {
  const manualPackedPins = 1073742847;
  const converted = toLegacyPackedPins(manualPackedPins);

  assert.equal(converted, 0);
});

test('packPinsFromRolls encodes strike and open frame masks', () => {
  assert.equal(packPinsFromRolls(10, null), 0);
  assert.equal(packPinsFromRolls(8, 1), 1027);
});

test('countLegacyRowsForGameFrames includes tenth-frame bonus rows', () => {
  const strikeTenthCount = countLegacyRowsForGameFrames([
    { frameNumber: 10, roll1: 10, roll2: 10, roll3: 9 },
  ]);
  const spareTenthCount = countLegacyRowsForGameFrames([
    { frameNumber: 10, roll1: 9, roll2: 1, roll3: 7 },
  ]);
  const openTenthCount = countLegacyRowsForGameFrames([
    { frameNumber: 10, roll1: 9, roll2: 0, roll3: null },
  ]);

  assert.equal(strikeTenthCount, 3);
  assert.equal(spareTenthCount, 2);
  assert.equal(openTenthCount, 1);
});

test('frameHasSpare only returns true for non-strike ten-pin totals', () => {
  assert.equal(frameHasSpare({ frameNumber: 4, roll1: 9, roll2: 1 }), true);
  assert.equal(frameHasSpare({ frameNumber: 4, roll1: 10, roll2: 0 }), false);
  assert.equal(frameHasSpare({ frameNumber: 4, roll1: 7, roll2: 1 }), false);
});
