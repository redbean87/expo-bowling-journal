import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeGameFrame,
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

test('computeGameFrame returns 0 for empty frames', () => {
  assert.equal(computeGameFrame([]), 0);
});

test('computeGameFrame returns max frame number for incomplete games', () => {
  const frames = [
    { frameNumber: 1, roll1: 8, roll2: 1 },
    { frameNumber: 2, roll1: 7, roll2: 2 },
    { frameNumber: 3, roll1: 9, roll2: 0 },
  ];
  assert.equal(computeGameFrame(frames), 3);
});

test('computeGameFrame returns 10 for open 10th frame', () => {
  const frames = [
    ...Array.from({ length: 9 }, (_, i) => ({
      frameNumber: i + 1,
      roll1: 8,
      roll2: 1,
    })),
    { frameNumber: 10, roll1: 7, roll2: 2, roll3: null },
  ];
  assert.equal(computeGameFrame(frames), 10);
});

test('computeGameFrame returns 11 for spare in 10th frame', () => {
  const frames = [
    ...Array.from({ length: 9 }, (_, i) => ({
      frameNumber: i + 1,
      roll1: 8,
      roll2: 1,
    })),
    { frameNumber: 10, roll1: 9, roll2: 1, roll3: 7 },
  ];
  assert.equal(computeGameFrame(frames), 11);
});

test('computeGameFrame returns 11 for strike in 10th with one bonus ball', () => {
  const frames = [
    ...Array.from({ length: 9 }, (_, i) => ({
      frameNumber: i + 1,
      roll1: 10,
      roll2: null,
    })),
    { frameNumber: 10, roll1: 10, roll2: 9, roll3: null },
  ];
  assert.equal(computeGameFrame(frames), 11);
});

test('computeGameFrame returns 12 for strike in 10th with two bonus balls', () => {
  const frames = [
    ...Array.from({ length: 9 }, (_, i) => ({
      frameNumber: i + 1,
      roll1: 10,
      roll2: null,
    })),
    { frameNumber: 10, roll1: 10, roll2: 10, roll3: 9 },
  ];
  assert.equal(computeGameFrame(frames), 12);
});
