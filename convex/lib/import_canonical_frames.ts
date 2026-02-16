import type { Id } from '../_generated/dataModel';

export type ImportedCanonicalFrameRow = {
  sqliteId: number;
  gameFk?: number | null;
  ballFk?: number | null;
  frameNum?: number | null;
  pins?: number | null;
  scores?: number | null;
  score?: number | null;
  flags?: number | null;
  pocket?: number | null;
  footBoard?: number | null;
  targetBoard?: number | null;
};

export type CanonicalFrameInsert = {
  gameId: Id<'games'>;
  frameNumber: number;
  roll1: number;
  roll2: number | null;
  roll3: number | null;
  ballId: Id<'balls'> | null;
  pins: number | null;
  scores: number | null;
  score: number | null;
  flags: number | null;
  pocket: number | null;
  footBoard: number | null;
  targetBoard: number | null;
};

export type CanonicalFramePlanArgs = {
  frames: ImportedCanonicalFrameRow[];
  gameIdMappings: Array<{ sqliteGameId: number; gameId: Id<'games'> }>;
  ballIdMappings: Array<{ sqliteBallId: number; ballId: Id<'balls'> }>;
};

type DecodedFrameRow = {
  source: ImportedCanonicalFrameRow;
  roll1: number;
  roll2: number;
  isStrike: boolean;
};

const FULL_PIN_MASK = 0x3ff;
const SECOND_ROLL_SHIFT = 10;
const THIRD_ROLL_SHIFT = 20;
const MANUAL_PIN_PACK_MARKER = 1 << 30;
const STRIKE_FLAG = 193;
export const DEFAULT_CANONICAL_FRAME_CHUNK_SIZE = 180;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function bitCount(value: number) {
  let working = value & FULL_PIN_MASK;
  let count = 0;

  while (working !== 0) {
    working &= working - 1;
    count += 1;
  }

  return count;
}

function toNullableNumber(value: number | null | undefined) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function maskFromCount(value: number | null | undefined) {
  if (value === undefined || value === null || value <= 0) {
    return 0;
  }

  if (value >= 10) {
    return FULL_PIN_MASK;
  }

  return (1 << value) - 1;
}

function packManualPinsMasks(
  roll1Mask: number,
  roll2Mask: number,
  roll3Mask: number
) {
  return (
    MANUAL_PIN_PACK_MARKER |
    (roll1Mask & FULL_PIN_MASK) |
    ((roll2Mask & FULL_PIN_MASK) << SECOND_ROLL_SHIFT) |
    ((roll3Mask & FULL_PIN_MASK) << THIRD_ROLL_SHIFT)
  );
}

function buildManualPinsPayload(
  source: ImportedCanonicalFrameRow,
  roll1: number,
  roll2: number | null,
  roll3: number | null
) {
  const packedPins =
    source.pins ?? FULL_PIN_MASK | (FULL_PIN_MASK << SECOND_ROLL_SHIFT);
  const standingAfterRoll1Mask = packedPins & FULL_PIN_MASK;
  const standingAfterRoll2Mask =
    (packedPins >> SECOND_ROLL_SHIFT) & FULL_PIN_MASK;
  const roll1Mask =
    roll1 === 10 ? FULL_PIN_MASK : FULL_PIN_MASK & ~standingAfterRoll1Mask;
  const roll2Mask =
    roll2 === null ? 0 : standingAfterRoll1Mask & ~standingAfterRoll2Mask;
  const roll3Mask = maskFromCount(roll3);

  return packManualPinsMasks(roll1Mask, roll2Mask, roll3Mask);
}

function decodeFrameRow(source: ImportedCanonicalFrameRow): DecodedFrameRow {
  const packedPins =
    source.pins ?? FULL_PIN_MASK | (FULL_PIN_MASK << SECOND_ROLL_SHIFT);
  const firstMask = packedPins & FULL_PIN_MASK;
  const secondMask = (packedPins >> SECOND_ROLL_SHIFT) & FULL_PIN_MASK;
  const standingAfterRoll1 = bitCount(firstMask);
  const standingAfterRoll2 = bitCount(secondMask);
  const roll1 = clamp(10 - standingAfterRoll1, 0, 10);
  const roll2 = clamp(standingAfterRoll1 - standingAfterRoll2, 0, 10 - roll1);
  const isStrike = (source.flags ?? 0) === STRIKE_FLAG || roll1 === 10;

  return {
    source,
    roll1,
    roll2,
    isStrike,
  };
}

function appendFrame(
  output: CanonicalFrameInsert[],
  gameId: Id<'games'>,
  ballIdBySqlite: Map<number, Id<'balls'>>,
  source: ImportedCanonicalFrameRow,
  frameNumber: number,
  roll1: number,
  roll2: number | null,
  roll3: number | null
) {
  output.push({
    gameId,
    frameNumber,
    roll1,
    roll2,
    roll3,
    ballId:
      source.ballFk === undefined || source.ballFk === null
        ? null
        : (ballIdBySqlite.get(source.ballFk) ?? null),
    pins: buildManualPinsPayload(source, roll1, roll2, roll3),
    scores: toNullableNumber(source.scores),
    score: toNullableNumber(source.score),
    flags: toNullableNumber(source.flags),
    pocket: toNullableNumber(source.pocket),
    footBoard: toNullableNumber(source.footBoard),
    targetBoard: toNullableNumber(source.targetBoard),
  });
}

function buildCanonicalFramesForGame(
  gameId: Id<'games'>,
  sourceRows: ImportedCanonicalFrameRow[],
  ballIdBySqlite: Map<number, Id<'balls'>>,
  output: CanonicalFrameInsert[]
) {
  const populatedRows = sourceRows
    .filter((row) => (row.flags ?? 0) !== 0)
    .sort((left, right) => {
      const leftFrameNum = left.frameNum ?? Number.MAX_SAFE_INTEGER;
      const rightFrameNum = right.frameNum ?? Number.MAX_SAFE_INTEGER;

      if (leftFrameNum !== rightFrameNum) {
        return leftFrameNum - rightFrameNum;
      }

      return left.sqliteId - right.sqliteId;
    })
    .map(decodeFrameRow);

  if (populatedRows.length === 0) {
    return;
  }

  for (let frameIndex = 0; frameIndex < 9; frameIndex += 1) {
    const row = populatedRows[frameIndex];

    if (!row) {
      break;
    }

    if (row.isStrike) {
      appendFrame(
        output,
        gameId,
        ballIdBySqlite,
        row.source,
        frameIndex + 1,
        10,
        null,
        null
      );
      continue;
    }

    appendFrame(
      output,
      gameId,
      ballIdBySqlite,
      row.source,
      frameIndex + 1,
      row.roll1,
      row.roll2,
      null
    );
  }

  const tenthRow = populatedRows[9];

  if (!tenthRow) {
    return;
  }

  const bonusRow1 = populatedRows[10];
  const bonusRow2 = populatedRows[11];

  if (tenthRow.isStrike) {
    const bonusRoll1 = bonusRow1?.roll1 ?? tenthRow.roll2;
    const bonusRoll2 = bonusRow2?.roll1 ?? bonusRow1?.roll2 ?? 0;

    appendFrame(
      output,
      gameId,
      ballIdBySqlite,
      tenthRow.source,
      10,
      10,
      bonusRoll1,
      bonusRoll2
    );
    return;
  }

  const isSpare = tenthRow.roll1 + tenthRow.roll2 === 10;

  if (isSpare) {
    appendFrame(
      output,
      gameId,
      ballIdBySqlite,
      tenthRow.source,
      10,
      tenthRow.roll1,
      tenthRow.roll2,
      bonusRow1?.roll1 ?? 0
    );
    return;
  }

  appendFrame(
    output,
    gameId,
    ballIdBySqlite,
    tenthRow.source,
    10,
    tenthRow.roll1,
    tenthRow.roll2,
    null
  );
}

export function buildCanonicalFrameInserts(
  args: CanonicalFramePlanArgs
): CanonicalFrameInsert[] {
  const framesByGame = new Map<number, ImportedCanonicalFrameRow[]>();

  for (const row of args.frames) {
    if (row.gameFk === undefined || row.gameFk === null) {
      continue;
    }

    const existing = framesByGame.get(row.gameFk);

    if (existing) {
      existing.push(row);
      continue;
    }

    framesByGame.set(row.gameFk, [row]);
  }

  const ballIdBySqlite = new Map<number, Id<'balls'>>(
    args.ballIdMappings.map((entry) => [entry.sqliteBallId, entry.ballId])
  );
  const output: CanonicalFrameInsert[] = [];

  for (const mapping of args.gameIdMappings) {
    buildCanonicalFramesForGame(
      mapping.gameId,
      framesByGame.get(mapping.sqliteGameId) ?? [],
      ballIdBySqlite,
      output
    );
  }

  return output;
}

export function chunkCanonicalFrameInserts(
  inserts: CanonicalFrameInsert[],
  chunkSize = DEFAULT_CANONICAL_FRAME_CHUNK_SIZE
) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize must be a positive integer');
  }

  const chunks: CanonicalFrameInsert[][] = [];

  for (let index = 0; index < inserts.length; index += chunkSize) {
    chunks.push(inserts.slice(index, index + chunkSize));
  }

  return chunks;
}
