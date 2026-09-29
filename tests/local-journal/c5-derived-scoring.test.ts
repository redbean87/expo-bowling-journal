/**
 * C5 — Derived game scoring/statistics tests for the REAL SQLite-backed
 * `SqliteLocalJournalService`.
 *
 * Like the C2/C3/C4 tests, these drive the real `src/db/database.ts`
 * lifecycle (open/migrate/close) against `node:sqlite` via the
 * `expo-sqlite` stub remap and exercise the C5 contract surface
 * (`getGameScore`): derived, never-persisted scoring from the canonical
 * frame masks, with gutter/open (zero-pin) semantics, ordinary open games,
 * spare and strike bonus resolution (including across frames), consecutive
 * strikes, tenth-frame spare/strike/strike+bonus variants, incomplete
 * (provisional) games, the maximum legal pin mask, cumulative totals,
 * per-frame score deltas, strike/spare/open counts, no-frames and unknown
 * games, exact parity with the authoritative `frame-scoring`
 * implementation, no mutation of the input or the database, and a seeded
 * pseudo-random sweep of valid games asserting scoring invariants (no
 * property-testing dependency).
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

const stubUrl = pathToFileURL(
  path.join(__dirname, '..', 'db', 'expo-sqlite-stub.mjs')
).href;

const hookHandle = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-sqlite') {
      return { url: stubUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

after(() => {
  hookHandle.deregister();
});

type DatabaseModule = typeof import('../../src/db/database');
type DatabaseHandle = Awaited<ReturnType<DatabaseModule['getDatabase']>>;
type ServiceModule =
  typeof import('../../src/services/local-journal/sqlite-local-journal-service');
type Journal = InstanceType<ServiceModule['SqliteLocalJournalService']>;

import {
  FULL_PIN_MASK,
  getRollValue,
  type FrameDraft,
} from '../../src/screens/game-editor/frame-mask-utils';
import {
  getProvisionalTotalScore,
  getSettledRunningTotals,
} from '../../src/screens/game-editor/frame-scoring';
import { scoreGameFrames } from '../../src/services/local-journal/game-scoring';

import type {
  Frame,
  FrameInput,
  Game,
  GameScore,
} from '../../src/services/local-journal/types';

async function loadDatabaseModule(): Promise<DatabaseModule> {
  return import('../../src/db/database');
}

/**
 * Close any open shared handle and return a fresh service instance over a
 * fresh in-memory database (the default stub behavior), plus the open
 * database handle for raw fixture access.
 */
async function freshJournal(): Promise<{
  journal: Journal;
  db: DatabaseHandle;
}> {
  const dbModule = await loadDatabaseModule();
  await dbModule.closeDatabase();
  const serviceModule =
    await import('../../src/services/local-journal/sqlite-local-journal-service');
  const db = await dbModule.getDatabase();
  return { journal: new serviceModule.SqliteLocalJournalService(), db };
}

/** Pin count -> mask: `count` pins down = the lowest `count` bits set. */
function toMask(count: number | null): number | null {
  if (count === null) {
    return null;
  }
  if (count === 0) {
    return 0;
  }
  return (1 << count) - 1;
}

/** A frame's three roll counts (null = not rolled). */
type RollTriple = [number | null, number | null, number | null];

/**
 * Seed a session + game and replace its frames with `rolls` (frame numbers
 * 1..rolls.length), returning the service, the game, and the frames as
 * read back from the database.
 */
async function seedGame(
  rolls: RollTriple[]
): Promise<{ journal: Journal; game: Game; frames: Frame[] }> {
  const { journal } = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-01',
    handicap: 3,
  });
  await journal.replaceGameFrames(
    game.id,
    rolls.map((roll, index) => ({
      frameNumber: index + 1,
      roll1Mask: toMask(roll[0]),
      roll2Mask: toMask(roll[1]),
      roll3Mask: toMask(roll[2]),
    }))
  );
  const frames = await journal.getGameFrames(game.id);
  return { journal, game, frames };
}

/**
 * The same frame -> draft mapping `game-scoring.ts` uses, written
 * independently here so the parity assertions are not tautological.
 */
function parityDrafts(frames: Frame[]): FrameDraft[] {
  const drafts: FrameDraft[] = Array.from({ length: 10 }, () => ({
    roll1Mask: null,
    roll2Mask: null,
    roll3Mask: null,
  }));

  for (const frame of frames) {
    const index = frame.frameNumber - 1;
    if (index < 0 || index >= 10) {
      continue;
    }
    drafts[index] = {
      roll1Mask: frame.roll1Mask ?? null,
      roll2Mask: frame.roll2Mask ?? null,
      roll3Mask: frame.roll3Mask ?? null,
    };
  }

  return drafts;
}

/**
 * Exact parity with the authoritative scoring implementation: the C5 result
 * must equal `getSettledRunningTotals` / `getProvisionalTotalScore` applied
 * to the same frame data.
 */
function assertParity(score: GameScore, frames: Frame[]): void {
  const drafts = parityDrafts(frames);
  assert.deepEqual(score.settledRunningTotals, getSettledRunningTotals(drafts));
  assert.equal(score.totalScore, getProvisionalTotalScore(drafts));
}

/**
 * Independent strike/spare/open classification following the existing
 * canonical behavior of the Convex `computeGameStats` implementation:
 * a frame is counted only when it has enough rolls to be classified
 * (strike = roll1 is 10; spare = roll2 present and sum 10; open = roll2
 * present and sum < 10).
 */
function independentCounts(frames: Frame[]): {
  strikes: number;
  spares: number;
  opens: number;
} {
  let strikes = 0;
  let spares = 0;
  let opens = 0;

  for (const frame of frames) {
    const index = frame.frameNumber - 1;
    if (index < 0 || index > 9) {
      continue;
    }
    const roll1 = getRollValue(frame.roll1Mask ?? null);
    if (roll1 === null) {
      continue;
    }
    if (roll1 === 10) {
      strikes += 1;
      continue;
    }
    const roll2 = getRollValue(frame.roll2Mask ?? null);
    if (roll2 === null) {
      continue;
    }
    const sum = roll1 + roll2;
    if (sum === 10) {
      spares += 1;
    } else if (sum < 10) {
      opens += 1;
    }
  }

  return { strikes, spares, opens };
}

/** Structural invariants that must hold for any score of any frame set. */
function assertScoringInvariants(score: GameScore, frames: Frame[]): void {
  assert.equal(score.settledRunningTotals.length, 10);
  assert.equal(score.frameScores.length, 10);
  assert.equal(score.totalScore >= 0, true);
  assert.equal(score.totalScore <= 300, true);
  assert.equal(
    score.isComplete,
    score.settledRunningTotals.every((total) => total !== null)
  );

  // Settled running totals are non-decreasing.
  let previous: number | null = null;
  for (const total of score.settledRunningTotals) {
    if (total !== null) {
      assert.equal(previous === null || total >= previous, true);
      previous = total;
    }
  }

  // A settled frame score is the frame's own points: 0..30.
  for (const frameScore of score.frameScores) {
    if (frameScore !== null) {
      assert.equal(frameScore >= 0 && frameScore <= 30, true);
    }
  }

  const counts = independentCounts(frames);
  assert.equal(score.strikes, counts.strikes);
  assert.equal(score.spares, counts.spares);
  assert.equal(score.opens, counts.opens);
  assert.equal(score.strikes + score.spares + score.opens <= 10, true);

  if (score.isComplete) {
    const final = score.settledRunningTotals[9];
    assert.notEqual(final, null);
    assert.equal(score.totalScore, final);
    const frameSum = score.frameScores.reduce<number>(
      (acc, value) => acc + (value ?? 0),
      0
    );
    assert.equal(frameSum, score.totalScore);
    assert.equal(score.strikes + score.spares + score.opens, 10);
  } else {
    const frameSum = score.frameScores.reduce<number>(
      (acc, value) => acc + (value ?? 0),
      0
    );
    assert.equal(frameSum <= score.totalScore, true);
  }
}

/* -------------------------------------------------------------------------- */
/* Contract surface                                                            */
/* -------------------------------------------------------------------------- */

test('getGameScore resolves null for an unknown game', async () => {
  const { journal } = await freshJournal();
  const score = await journal.getGameScore(
    '00000000-0000-4000-8000-000000000000'
  );
  assert.equal(score, null);
});

test('game with no frames scores 0 and is not complete', async () => {
  const { journal, game, frames } = await seedGame([]);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(frames.length, 0);
  assert.deepEqual(score, {
    isComplete: false,
    totalScore: 0,
    settledRunningTotals: Array.from({ length: 10 }, () => null),
    frameScores: Array.from({ length: 10 }, () => null),
    strikes: 0,
    spares: 0,
    opens: 0,
  });
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

/* -------------------------------------------------------------------------- */
/* Gutter / open (zero-pin) semantics                                          */
/* -------------------------------------------------------------------------- */

test('all-gutter game: total 0, every frame open', async () => {
  const rolls: RollTriple[] = Array.from(
    { length: 10 },
    () => [0, 0, null] as RollTriple
  );
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, true);
  assert.equal(score.totalScore, 0);
  assert.deepEqual(score.settledRunningTotals, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(score.frameScores, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(score.strikes, 0);
  assert.equal(score.spares, 0);
  assert.equal(score.opens, 10);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

/* -------------------------------------------------------------------------- */
/* Ordinary open game                                                          */
/* -------------------------------------------------------------------------- */

test('ordinary open game: cumulative totals and frame score deltas', async () => {
  const rolls: RollTriple[] = Array.from(
    { length: 10 },
    () => [7, 2, null] as RollTriple
  );
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, true);
  assert.equal(score.totalScore, 90);
  assert.deepEqual(
    score.settledRunningTotals,
    [9, 18, 27, 36, 45, 54, 63, 72, 81, 90]
  );
  assert.deepEqual(score.frameScores, [9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);
  assert.equal(score.strikes, 0);
  assert.equal(score.spares, 0);
  assert.equal(score.opens, 10);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

/* -------------------------------------------------------------------------- */
/* Spare bonus                                                                 */
/* -------------------------------------------------------------------------- */

test('spare bonus: spare earns the next roll', async () => {
  const rolls: RollTriple[] = [
    [7, 3, null],
    [4, 5, null],
    [2, 6, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
  ];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, true);
  assert.equal(score.totalScore, 31);
  assert.deepEqual(
    score.settledRunningTotals,
    [14, 23, 31, 31, 31, 31, 31, 31, 31, 31]
  );
  assert.deepEqual(score.frameScores, [14, 9, 8, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(score.strikes, 0);
  assert.equal(score.spares, 1);
  assert.equal(score.opens, 9);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

/* -------------------------------------------------------------------------- */
/* Strike bonus                                                                */
/* -------------------------------------------------------------------------- */

test('strike bonus: strike earns the next two rolls', async () => {
  const rolls: RollTriple[] = [
    [10, null, null],
    [4, 5, null],
    [6, 3, null],
    [1, 7, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
  ];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, true);
  assert.equal(score.totalScore, 45);
  assert.deepEqual(
    score.settledRunningTotals,
    [19, 28, 37, 45, 45, 45, 45, 45, 45, 45]
  );
  assert.deepEqual(score.frameScores, [19, 9, 9, 8, 0, 0, 0, 0, 0, 0]);
  assert.equal(score.strikes, 1);
  assert.equal(score.spares, 0);
  assert.equal(score.opens, 9);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

test('consecutive strikes: bonuses resolve across frames', async () => {
  const rolls: RollTriple[] = [
    [10, null, null],
    [10, null, null],
    [10, null, null],
    [3, 4, null],
    [6, 3, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
  ];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, true);
  assert.equal(score.totalScore, 86);
  assert.deepEqual(
    score.settledRunningTotals,
    [30, 53, 70, 77, 86, 86, 86, 86, 86, 86]
  );
  assert.deepEqual(score.frameScores, [30, 23, 17, 7, 9, 0, 0, 0, 0, 0]);
  assert.equal(score.strikes, 3);
  assert.equal(score.spares, 0);
  assert.equal(score.opens, 7);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

/* -------------------------------------------------------------------------- */
/* Tenth frame                                                                 */
/* -------------------------------------------------------------------------- */

test('tenth-frame spare: spare plus bonus roll', async () => {
  const rolls: RollTriple[] = [
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [5, 5, 4],
  ];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, true);
  assert.equal(score.totalScore, 14);
  assert.deepEqual(score.settledRunningTotals, [0, 0, 0, 0, 0, 0, 0, 0, 0, 14]);
  assert.deepEqual(score.frameScores, [0, 0, 0, 0, 0, 0, 0, 0, 0, 14]);
  assert.equal(score.strikes, 0);
  assert.equal(score.spares, 1);
  assert.equal(score.opens, 9);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

test('tenth-frame strike: strike plus bonus roll', async () => {
  const rolls: RollTriple[] = [
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [10, 7, 3],
  ];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, true);
  assert.equal(score.totalScore, 20);
  assert.deepEqual(score.settledRunningTotals, [0, 0, 0, 0, 0, 0, 0, 0, 0, 20]);
  assert.deepEqual(score.frameScores, [0, 0, 0, 0, 0, 0, 0, 0, 0, 20]);
  assert.equal(score.strikes, 1);
  assert.equal(score.spares, 0);
  assert.equal(score.opens, 9);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

test('tenth-frame strike, strike, 10: strike plus strike bonus', async () => {
  const rolls: RollTriple[] = [
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [10, 10, 10],
  ];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, true);
  assert.equal(score.totalScore, 30);
  assert.deepEqual(score.settledRunningTotals, [0, 0, 0, 0, 0, 0, 0, 0, 0, 30]);
  assert.deepEqual(score.frameScores, [0, 0, 0, 0, 0, 0, 0, 0, 0, 30]);
  assert.equal(score.strikes, 1);
  assert.equal(score.spares, 0);
  assert.equal(score.opens, 9);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

test('tenth-frame strike, strike, 7: strike plus partial bonus', async () => {
  const rolls: RollTriple[] = [
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [10, 10, 7],
  ];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, true);
  assert.equal(score.totalScore, 27);
  assert.deepEqual(score.settledRunningTotals, [0, 0, 0, 0, 0, 0, 0, 0, 0, 27]);
  assert.deepEqual(score.frameScores, [0, 0, 0, 0, 0, 0, 0, 0, 0, 27]);
  assert.equal(score.strikes, 1);
  assert.equal(score.spares, 0);
  assert.equal(score.opens, 9);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

/* -------------------------------------------------------------------------- */
/* Incomplete (provisional) games                                              */
/* -------------------------------------------------------------------------- */

test('incomplete game: three strikes, provisional total and settled frame 1', async () => {
  const rolls: RollTriple[] = [
    [10, null, null],
    [10, null, null],
    [10, null, null],
  ];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, false);
  assert.equal(score.totalScore, 60);
  assert.deepEqual(score.settledRunningTotals, [
    30,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  assert.deepEqual(score.frameScores, [
    30,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  assert.equal(score.strikes, 3);
  assert.equal(score.spares, 0);
  assert.equal(score.opens, 0);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

test('incomplete game: spare then partial next frame', async () => {
  const rolls: RollTriple[] = [
    [7, 3, null],
    [4, null, null],
  ];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, false);
  assert.equal(score.totalScore, 18);
  assert.deepEqual(score.settledRunningTotals, [
    14,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  assert.deepEqual(score.frameScores, [
    14,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  assert.equal(score.strikes, 0);
  assert.equal(score.spares, 1);
  assert.equal(score.opens, 0);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

test('incomplete game: partial open frame counts its entered roll', async () => {
  const rolls: RollTriple[] = [[7, null, null]];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, false);
  assert.equal(score.totalScore, 7);
  assert.deepEqual(score.settledRunningTotals, [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  assert.deepEqual(score.frameScores, [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  assert.equal(score.strikes, 0);
  assert.equal(score.spares, 0);
  assert.equal(score.opens, 0);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

test('incomplete tenth frame: strike without bonus roll is not settled', async () => {
  const rolls: RollTriple[] = [
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [10, null, null],
  ];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, false);
  assert.equal(score.totalScore, 10);
  assert.deepEqual(score.settledRunningTotals, [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    null,
  ]);
  assert.deepEqual(score.frameScores, [0, 0, 0, 0, 0, 0, 0, 0, 0, null]);
  assert.equal(score.strikes, 1);
  assert.equal(score.spares, 0);
  assert.equal(score.opens, 9);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

test('incomplete tenth frame: spare without bonus roll is not settled', async () => {
  const rolls: RollTriple[] = [
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [5, 5, null],
  ];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  assert.equal(score.isComplete, false);
  assert.equal(score.totalScore, 10);
  assert.deepEqual(score.settledRunningTotals, [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    null,
  ]);
  assert.deepEqual(score.frameScores, [0, 0, 0, 0, 0, 0, 0, 0, 0, null]);
  assert.equal(score.strikes, 0);
  assert.equal(score.spares, 1);
  assert.equal(score.opens, 9);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

/* -------------------------------------------------------------------------- */
/* Edge cases                                                                  */
/* -------------------------------------------------------------------------- */

test('maximum legal pin mask: full-mask strike', async () => {
  const rolls: RollTriple[] = [
    [10, null, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
  ];
  const { journal, game, frames } = await seedGame(rolls);
  const score = (await journal.getGameScore(game.id))!;

  // The round-tripped mask is the full 10-bit mask.
  assert.equal(frames[0]?.roll1Mask, FULL_PIN_MASK);

  assert.equal(score.isComplete, true);
  assert.equal(score.totalScore, 10);
  assert.deepEqual(
    score.settledRunningTotals,
    [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
  );
  assert.deepEqual(score.frameScores, [10, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(score.strikes, 1);
  assert.equal(score.spares, 0);
  assert.equal(score.opens, 9);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

test('frame with out-of-range frameNumber is ignored by scoring', async () => {
  const { journal, game } = await seedGame([
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
  ]);

  // C4 permits raw frame writes; a frameNumber outside 1..10 is not a
  // bowling frame and must not affect scoring.
  const extra: FrameInput[] = [
    {
      frameNumber: 11,
      roll1Mask: toMask(10),
    },
  ];
  await journal.replaceGameFrames(game.id, [
    ...(await journal.getGameFrames(game.id)).map((frame) => ({
      frameNumber: frame.frameNumber,
      roll1Mask: frame.roll1Mask ?? null,
      roll2Mask: frame.roll2Mask ?? null,
      roll3Mask: frame.roll3Mask ?? null,
    })),
    ...extra,
  ]);

  const frames = await journal.getGameFrames(game.id);
  assert.equal(frames.length, 10);

  const score = (await journal.getGameScore(game.id))!;
  assert.equal(score.isComplete, false);
  assert.equal(score.totalScore, 0);
  assert.deepEqual(score.settledRunningTotals, [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    null,
  ]);
  assert.equal(score.strikes, 0);
  assert.equal(score.spares, 0);
  assert.equal(score.opens, 9);
  assertParity(score, frames);
  assertScoringInvariants(score, frames);
});

/* -------------------------------------------------------------------------- */
/* Non-persistence / purity                                                    */
/* -------------------------------------------------------------------------- */

test('getGameScore writes nothing to the database and mutates nothing', async () => {
  const rolls: RollTriple[] = [
    [10, null, null],
    [7, 3, null],
    [4, 5, null],
    [10, null, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
    [0, 0, null],
  ];
  const { journal, db } = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-01',
    handicap: 3,
  });
  await journal.replaceGameFrames(
    game.id,
    rolls.map((roll, index) => ({
      frameNumber: index + 1,
      roll1Mask: toMask(roll[0]),
      roll2Mask: toMask(roll[1]),
      roll3Mask: toMask(roll[2]),
    }))
  );
  const frames = await journal.getGameFrames(game.id);
  const before = await journal.getGame(game.id);

  const score = (await journal.getGameScore(game.id))!;
  assert.equal(score.totalScore, 53);

  // Frames and the game row are unchanged after scoring.
  const after = await journal.getGameFrames(game.id);
  assert.deepEqual(after, frames);
  const afterGame = (await journal.getGame(game.id))!;
  assert.deepEqual(afterGame, before);
  assert.equal(afterGame.handicap, 3);

  const countRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM frames WHERE gameId = ?',
    [game.id]
  );
  assert.equal(countRow?.count, 10);
});

test('scoreGameFrames is pure: deterministic and mutation-free', () => {
  const frames: Frame[] = [
    {
      id: 'frame-1',
      gameId: 'game-1',
      frameNumber: 1,
      roll1Mask: toMask(10),
      roll2Mask: null,
      roll3Mask: null,
    },
    {
      id: 'frame-2',
      gameId: 'game-1',
      frameNumber: 2,
      roll1Mask: toMask(7),
      roll2Mask: toMask(3),
      roll3Mask: null,
    },
    {
      id: 'frame-3',
      gameId: 'game-1',
      frameNumber: 3,
      roll1Mask: toMask(4),
      roll2Mask: toMask(5),
      roll3Mask: null,
    },
  ];
  const original = JSON.parse(JSON.stringify(frames));

  const first = scoreGameFrames(frames);
  const second = scoreGameFrames(frames);

  assert.deepEqual(first, second);
  assert.deepEqual(frames, original);
  assertParity(first, frames);
  assertScoringInvariants(first, frames);
});

/* -------------------------------------------------------------------------- */
/* Seeded pseudo-random sweep                                                  */
/* -------------------------------------------------------------------------- */

/** Deterministic linear congruential generator in [0, 1). */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomInt(rand: () => number, count: number): number {
  return Math.floor(rand() * count);
}

/** A valid frame 1..9: strike, spare, open, or a partial frame. */
function randomFrames1to9(rand: () => number): RollTriple {
  const roll1 = randomInt(rand, 11);
  if (roll1 === 10) {
    return [10, null, null];
  }
  if (rand() < 0.1) {
    return [roll1, null, null];
  }
  const roll2 = randomInt(rand, 11 - roll1);
  return [roll1, roll2, null];
}

/** A valid tenth frame: strike, spare, open, or partial (with bonus rolls). */
function randomFrame10(rand: () => number): RollTriple {
  const roll1 = randomInt(rand, 11);
  if (roll1 === 10) {
    const roll2 = randomInt(rand, 11);
    const roll3 = randomInt(rand, 11);
    return [10, roll2, roll3];
  }
  if (rand() < 0.1) {
    return [roll1, null, null];
  }
  const roll2 = randomInt(rand, 11 - roll1);
  if (roll1 + roll2 === 10) {
    const roll3 = randomInt(rand, 11);
    return [roll1, roll2, roll3];
  }
  return [roll1, roll2, null];
}

/** A valid game: ten valid frames, occasionally truncated mid-game. */
function randomValidGame(rand: () => number): RollTriple[] {
  const rolls: RollTriple[] = [];
  for (let frame = 1; frame <= 9; frame += 1) {
    rolls.push(randomFrames1to9(rand));
    if (rand() < 0.05) {
      break;
    }
  }
  if (rolls.length === 9) {
    rolls.push(randomFrame10(rand));
  }
  return rolls;
}

test('seeded pseudo-random sweep: scoring invariants hold across valid games', () => {
  const rand = lcg(0xc5c5c5c5);
  const gameCount = 5000;

  for (let i = 0; i < gameCount; i += 1) {
    const rolls = randomValidGame(rand);
    const frames: Frame[] = rolls.map((roll, index) => ({
      id: `frame-${index + 1}`,
      gameId: 'game-1',
      frameNumber: index + 1,
      roll1Mask: toMask(roll[0]),
      roll2Mask: toMask(roll[1]),
      roll3Mask: toMask(roll[2]),
    }));
    const original = JSON.parse(JSON.stringify(frames));

    const score = scoreGameFrames(frames);
    assertScoringInvariants(score, frames);
    assertParity(score, frames);

    // Determinism.
    const again = scoreGameFrames(frames);
    assert.deepEqual(again, score);

    // No input mutation.
    assert.deepEqual(frames, original);
  }
});

test('random games round-trip through the SQLite service', async () => {
  const rand = lcg(0x5eed5eed);
  const gameCount = 5;

  for (let i = 0; i < gameCount; i += 1) {
    const rolls = randomValidGame(rand);
    const { journal, game, frames } = await seedGame(rolls);
    const score = (await journal.getGameScore(game.id))!;

    assert.deepEqual(score, scoreGameFrames(frames));
    assertParity(score, frames);
    assertScoringInvariants(score, frames);
  }
});
