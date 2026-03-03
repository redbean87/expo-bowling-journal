import assert from 'node:assert/strict';
import test from 'node:test';

import { computeAverageTargets } from '../../src/utils/average-targets';

/**
 * Real-world baseline from the bug report screenshots:
 *   84 games, 16,928 total pins → average 201.52, floorAvg = 201
 *   4-game session
 *
 * ceil((84 + 1) / 4) * 4 = ceil(85/4) * 4 = 22 * 4 = 88
 * holdTarget = 201 × 88 − 16,928 = 17,688 − 16,928 = 760
 * gainTarget = 202 × 88 − 16,928 = 17,776 − 16,928 = 848
 */

test('bug report baseline: 84 games, 16928 pins, n=4', () => {
  const { holdTarget, gainTarget } = computeAverageTargets(84, 16928, 4);
  assert.equal(holdTarget, 760);
  assert.equal(gainTarget, 848);
});

test('mid-session countdown: after game 1 (300)', () => {
  // 85 games, 17228 pins — roundedGames still 88
  // floorAvg = floor(17228/85) = floor(202.7) = 202
  // holdTarget = 202 × 88 − 17228 = 17776 − 17228 = 548
  // gainTarget = 203 × 88 − 17228 = 17864 − 17228 = 636
  const { holdTarget, gainTarget } = computeAverageTargets(85, 17228, 4);
  assert.equal(holdTarget, 548);
  assert.equal(gainTarget, 636);
});

test('mid-session countdown: after game 2 (300) — reported screenshot state', () => {
  // 86 games, 17528 pins — roundedGames still 88
  // floorAvg = floor(17528/86) = floor(203.8) = 203
  // holdTarget = 203 × 88 − 17528 = 17864 − 17528 = 336
  // gainTarget = 204 × 88 − 17528 = 17952 − 17528 = 424
  const { holdTarget, gainTarget } = computeAverageTargets(86, 17528, 4);
  assert.equal(holdTarget, 336);
  assert.equal(gainTarget, 424);
});

test('session complete: all 4 games done — resets to next session boundary', () => {
  // 88 games on boundary → ceil((88+1)/4)*4 = ceil(89/4)*4 = 23*4 = 92
  // Targets now reflect what is needed across the next session
  const { holdTarget, gainTarget } = computeAverageTargets(88, 17928, 4);
  const floorAvg = Math.floor(17928 / 88); // 203
  const roundedGames = 92;
  assert.equal(holdTarget, floorAvg * roundedGames - 17928);
  assert.equal(gainTarget, (floorAvg + 1) * roundedGames - 17928);
});

test('already on boundary without partial session: always projects forward', () => {
  // 84 games exactly on 4-game boundary → rounds to 88, never stays at 84
  const { holdTarget } = computeAverageTargets(84, 16928, 4);
  assert.ok(
    holdTarget > 0,
    'holdTarget should be positive (projected forward)'
  );
  // roundedGames = ceil(85/4)*4 = 88
  const floorAvg = Math.floor(16928 / 84); // 201
  assert.equal(holdTarget, floorAvg * 88 - 16928);
});

test('holdTarget actually maintains floor average at session end', () => {
  const gamesPlayed = 84;
  const totalPins = 16928;
  const n = 4;
  const { holdTarget } = computeAverageTargets(gamesPlayed, totalPins, n);

  const roundedGames = Math.ceil((gamesPlayed + 1) / n) * n; // 88
  const newAvg = (totalPins + holdTarget) / roundedGames;
  assert.equal(Math.floor(newAvg), Math.floor(totalPins / gamesPlayed));
});

test('gainTarget raises floor average by exactly 1 at session end', () => {
  const gamesPlayed = 84;
  const totalPins = 16928;
  const n = 4;
  const { gainTarget } = computeAverageTargets(gamesPlayed, totalPins, n);

  const roundedGames = Math.ceil((gamesPlayed + 1) / n) * n; // 88
  const newAvg = (totalPins + gainTarget) / roundedGames;
  assert.equal(Math.floor(newAvg), Math.floor(totalPins / gamesPlayed) + 1);
});

test('gainTarget minus holdTarget always equals roundedGames', () => {
  // gainTarget - holdTarget = (floorAvg+1)*rg - total - (floorAvg*rg - total) = rg
  const cases: [number, number, number][] = [
    [10, 1825, 3],
    [84, 16928, 4],
    [27, 5400, 3],
    [1, 175, 3],
  ];
  for (const [gamesPlayed, totalPins, n] of cases) {
    const roundedGames = Math.ceil((gamesPlayed + 1) / n) * n;
    const { holdTarget, gainTarget } = computeAverageTargets(
      gamesPlayed,
      totalPins,
      n
    );
    assert.equal(gainTarget - holdTarget, roundedGames);
  }
});

test('first session ever: 1 game played, n=3 → rounds up to 3', () => {
  // ceil((1+1)/3)*3 = ceil(2/3)*3 = 1*3 = 3
  const totalPins = 175;
  const { holdTarget, gainTarget } = computeAverageTargets(1, totalPins, 3);
  const floorAvg = Math.floor(175 / 1); // 175
  assert.equal(holdTarget, floorAvg * 3 - totalPins); // 175*3 - 175 = 350
  assert.equal(gainTarget, (floorAvg + 1) * 3 - totalPins); // 176*3 - 175 = 353
});

test('3-game session with exact-integer average', () => {
  // 27 games, 5400 pins → average exactly 200, floorAvg = 200
  // roundedGames = ceil(28/3)*3 = 10*3 = 30
  // holdTarget = 200 * 30 − 5400 = 600
  // gainTarget = 201 * 30 − 5400 = 630
  const { holdTarget, gainTarget } = computeAverageTargets(27, 5400, 3);
  assert.equal(holdTarget, 600);
  assert.equal(gainTarget, 630);
});

test('fractional average: holdTarget is lower than the old floorAvg*n formula', () => {
  // 10 games, 1825 pins → average 182.5, floorAvg = 182
  // roundedGames = ceil(11/3)*3 = 4*3 = 12
  // holdTarget = 182 * 12 − 1825 = 2184 − 1825 = 359
  // old wrong formula: 182 * 3 = 546 (way too high)
  const { holdTarget } = computeAverageTargets(10, 1825, 3);
  assert.equal(holdTarget, 359);
  assert.ok(
    holdTarget < 182 * 3,
    'new formula should be lower than old floorAvg*n'
  );
});
