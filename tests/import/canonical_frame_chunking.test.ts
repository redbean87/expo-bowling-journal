import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCanonicalFrameInserts,
  chunkCanonicalFrameInserts,
  DEFAULT_CANONICAL_FRAME_CHUNK_SIZE,
} from '../../convex/lib/import_canonical_frames';

import type { Id } from '../../convex/_generated/dataModel';

const FULL_PIN_MASK = 0x3ff;
const MANUAL_PIN_PACK_MARKER = 1 << 30;

function asGameId(value: string) {
  return value as Id<'games'>;
}

function asBallId(value: string) {
  return value as Id<'balls'>;
}

function standingMask(standingPins: number) {
  if (standingPins <= 0) {
    return 0;
  }

  if (standingPins >= 10) {
    return 0x3ff;
  }

  return (1 << standingPins) - 1;
}

function buildFrameRow(
  sqliteId: number,
  gameFk: number,
  frameNum: number,
  roll1: number,
  roll2: number,
  flags: number
) {
  const standingAfterRoll1 = 10 - roll1;
  const standingAfterRoll2 = standingAfterRoll1 - roll2;

  return {
    sqliteId,
    gameFk,
    ballFk: 7,
    frameNum,
    pins:
      standingMask(standingAfterRoll1) |
      (standingMask(standingAfterRoll2) << 10),
    scores: null,
    score: null,
    flags,
    pocket: null,
    footBoard: null,
    targetBoard: null,
  };
}

test('chunkCanonicalFrameInserts splits into bounded chunk sizes', () => {
  const inserts = Array.from({ length: 401 }, (_, index) => ({
    gameId: asGameId(`game_${String(index)}`),
    frameNumber: 1,
    roll1: 9,
    roll2: 0,
    roll3: null,
    ballId: null,
    pins: null,
    scores: null,
    score: null,
    flags: null,
    pocket: null,
    footBoard: null,
    targetBoard: null,
  }));

  const chunks = chunkCanonicalFrameInserts(inserts, 180);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 180);
  assert.equal(chunks[1].length, 180);
  assert.equal(chunks[2].length, 41);
});

test('buildCanonicalFrameInserts derives 10 canonical frames per complete game', () => {
  const gameId = asGameId('game_1');
  const rows = [
    ...Array.from({ length: 10 }, (_, frameIndex) =>
      buildFrameRow(frameIndex + 1, 100, frameIndex, 10, 0, 193)
    ),
    buildFrameRow(11, 100, 10, 10, 0, 193),
    buildFrameRow(12, 100, 11, 10, 0, 193),
  ];

  const inserts = buildCanonicalFrameInserts({
    frames: rows,
    gameIdMappings: [{ sqliteGameId: 100, gameId }],
    ballIdMappings: [{ sqliteBallId: 7, ballId: asBallId('ball_7') }],
  });

  assert.equal(inserts.length, 10);
  assert.equal(inserts[0].frameNumber, 1);
  assert.equal(inserts[0].roll1, 10);
  assert.equal(inserts[0].roll2, null);
  assert.equal(inserts[9].frameNumber, 10);
  assert.equal(inserts[9].roll1, 10);
  assert.equal(inserts[9].roll2, 10);
  assert.equal(inserts[9].roll3, 10);
  assert.equal(inserts[9].ballId, asBallId('ball_7'));
  assert.equal((inserts[0].pins ?? 0) >= MANUAL_PIN_PACK_MARKER, true);
  assert.equal((inserts[0].pins ?? 0) & FULL_PIN_MASK, FULL_PIN_MASK);
});

test('large import frame plan yields multiple default-size chunks', () => {
  const gameCount = 700;
  const frames = [] as ReturnType<typeof buildFrameRow>[];
  const gameIdMappings = [] as Array<{
    sqliteGameId: number;
    gameId: Id<'games'>;
  }>;

  for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
    const sqliteGameId = gameIndex + 1;
    gameIdMappings.push({
      sqliteGameId,
      gameId: asGameId(`game_${String(sqliteGameId)}`),
    });

    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
      frames.push(
        buildFrameRow(
          sqliteGameId * 100 + frameIndex,
          sqliteGameId,
          frameIndex,
          9,
          0,
          195
        )
      );
    }
  }

  const inserts = buildCanonicalFrameInserts({
    frames,
    gameIdMappings,
    ballIdMappings: [{ sqliteBallId: 7, ballId: asBallId('ball_7') }],
  });
  const chunks = chunkCanonicalFrameInserts(
    inserts,
    DEFAULT_CANONICAL_FRAME_CHUNK_SIZE
  );

  assert.equal(inserts.length, gameCount * 10);
  assert.equal(chunks.length > 1, true);
  assert.equal(
    chunks.every((chunk) => chunk.length <= DEFAULT_CANONICAL_FRAME_CHUNK_SIZE),
    true
  );
});
