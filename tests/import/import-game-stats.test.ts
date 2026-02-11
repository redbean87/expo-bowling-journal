import assert from 'node:assert/strict';
import test from 'node:test';

import { computeImportedGameStats } from '../../convex/lib/import_game_stats';

function standingMask(standingPins: number) {
  if (standingPins <= 0) {
    return 0;
  }

  if (standingPins >= 10) {
    return 0x3ff;
  }

  return (1 << standingPins) - 1;
}

function buildRow(
  sqliteId: number,
  frameNum: number,
  roll1: number,
  roll2: number,
  flags: number
) {
  const standingAfterRoll1 = 10 - roll1;
  const standingAfterRoll2 = standingAfterRoll1 - roll2;
  const firstMask = standingMask(standingAfterRoll1);
  const secondMask = standingMask(standingAfterRoll2);

  return {
    sqliteId,
    frameNum,
    pins: firstMask | (secondMask << 10),
    flags,
  };
}

test('computes a perfect game from imported frame rows', () => {
  const rows = [
    ...Array.from({ length: 10 }, (_, index) =>
      buildRow(index + 1, index, 10, 0, 193)
    ),
    buildRow(11, 10, 10, 0, 193),
    buildRow(12, 11, 10, 0, 193),
  ];

  const stats = computeImportedGameStats(rows, 0);

  assert.equal(stats.totalScore, 300);
  assert.equal(stats.strikes, 10);
  assert.equal(stats.spares, 0);
  assert.equal(stats.opens, 0);
});

test('computes spare-heavy game score and counts', () => {
  const rows = [
    ...Array.from({ length: 10 }, (_, index) =>
      buildRow(index + 1, index, 9, 1, 195)
    ),
    buildRow(11, 10, 9, 0, 195),
  ];

  const stats = computeImportedGameStats(rows, 0);

  assert.equal(stats.totalScore, 190);
  assert.equal(stats.strikes, 0);
  assert.equal(stats.spares, 10);
  assert.equal(stats.opens, 0);
});

test('computes open-frame game score and counts', () => {
  const rows = Array.from({ length: 10 }, (_, index) =>
    buildRow(index + 1, index, 9, 0, 195)
  );
  const stats = computeImportedGameStats(rows, 0);

  assert.equal(stats.totalScore, 90);
  assert.equal(stats.strikes, 0);
  assert.equal(stats.spares, 0);
  assert.equal(stats.opens, 10);
});

test('falls back to provided score when imported frame rows are incomplete', () => {
  const rows = [buildRow(1, 0, 10, 0, 193), buildRow(2, 1, 9, 0, 195)];
  const stats = computeImportedGameStats(rows, 135);

  assert.equal(stats.totalScore, 135);
  assert.equal(stats.strikes, 1);
  assert.equal(stats.spares, 0);
  assert.equal(stats.opens, 1);
});

test('returns fallback score and zero counts when no frame rows are present', () => {
  const stats = computeImportedGameStats([], 147);

  assert.equal(stats.totalScore, 147);
  assert.equal(stats.strikes, 0);
  assert.equal(stats.spares, 0);
  assert.equal(stats.opens, 0);
});
