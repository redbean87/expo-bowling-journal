import { buildGameFramePreview } from './game_frame_preview';

export type ImportedFrameRow = {
  sqliteId: number;
  frameNum?: number | null;
  pins?: number | null;
  flags?: number | null;
};

export type ComputedGameStats = {
  totalScore: number;
  strikes: number;
  spares: number;
  opens: number;
};

type ImportedPreviewFrame = {
  frameNumber: number;
  roll1: number;
  roll2: number | null;
  roll3: number | null;
  pins: null;
};

type DecodedFrameRow = {
  roll1: number;
  roll2: number;
  flags: number;
};

type ParsedGameFrame = {
  frameRolls: number[];
  isStrike: boolean;
  isSpare: boolean;
  isOpen: boolean;
};

const FULL_PIN_MASK = 0x3ff;
const SECOND_ROLL_SHIFT = 10;
const STRIKE_FLAG = 193;

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

function decodeFrameRow(row: ImportedFrameRow): DecodedFrameRow {
  const packedPins =
    row.pins ?? FULL_PIN_MASK | (FULL_PIN_MASK << SECOND_ROLL_SHIFT);
  const firstMask = packedPins & FULL_PIN_MASK;
  const secondMask = (packedPins >> SECOND_ROLL_SHIFT) & FULL_PIN_MASK;
  const standingAfterRoll1 = bitCount(firstMask);
  const standingAfterRoll2 = bitCount(secondMask);
  const roll1 = clamp(10 - standingAfterRoll1, 0, 10);
  const roll2 = clamp(standingAfterRoll1 - standingAfterRoll2, 0, 10 - roll1);

  return {
    roll1,
    roll2,
    flags: row.flags ?? 0,
  };
}

function scoreFrames(frames: ParsedGameFrame[]): number {
  const rolls = frames.flatMap((frame) => frame.frameRolls);
  let rollIndex = 0;
  let total = 0;

  for (let frameNumber = 0; frameNumber < 10; frameNumber += 1) {
    const roll1 = rolls[rollIndex] ?? 0;

    if (roll1 === 10) {
      total += 10 + (rolls[rollIndex + 1] ?? 0) + (rolls[rollIndex + 2] ?? 0);
      rollIndex += 1;
      continue;
    }

    const roll2 = rolls[rollIndex + 1] ?? 0;

    if (roll1 + roll2 === 10) {
      total += 10 + (rolls[rollIndex + 2] ?? 0);
    } else {
      total += roll1 + roll2;
    }

    rollIndex += 2;
  }

  return total;
}

function parseFrames(rows: ImportedFrameRow[]) {
  const populatedRows = rows
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
    return {
      frames: [] as ParsedGameFrame[],
      hasConfidentScore: false,
    };
  }

  const frames: ParsedGameFrame[] = [];

  for (let frameIndex = 0; frameIndex < 9; frameIndex += 1) {
    const row = populatedRows[frameIndex];

    if (!row) {
      break;
    }

    const isStrike = row.flags === STRIKE_FLAG || row.roll1 === 10;

    if (isStrike) {
      frames.push({
        frameRolls: [10],
        isStrike: true,
        isSpare: false,
        isOpen: false,
      });
      continue;
    }

    const roll2 = clamp(row.roll2, 0, 10 - row.roll1);
    const isSpare = row.roll1 + roll2 === 10;
    frames.push({
      frameRolls: [row.roll1, roll2],
      isStrike: false,
      isSpare,
      isOpen: !isSpare,
    });
  }

  const tenthRow = populatedRows[9];

  if (tenthRow) {
    const bonusRow1 = populatedRows[10];
    const bonusRow2 = populatedRows[11];
    const isTenthStrike =
      tenthRow.flags === STRIKE_FLAG || tenthRow.roll1 === 10;

    if (isTenthStrike) {
      const bonusRoll1 = bonusRow1?.roll1 ?? tenthRow.roll2;
      const bonusRoll2 = bonusRow2?.roll1 ?? bonusRow1?.roll2 ?? 0;
      frames.push({
        frameRolls: [10, bonusRoll1, bonusRoll2],
        isStrike: true,
        isSpare: false,
        isOpen: false,
      });
    } else {
      const roll2 = clamp(tenthRow.roll2, 0, 10 - tenthRow.roll1);
      const isSpare = tenthRow.roll1 + roll2 === 10;

      if (isSpare) {
        frames.push({
          frameRolls: [tenthRow.roll1, roll2, bonusRow1?.roll1 ?? 0],
          isStrike: false,
          isSpare: true,
          isOpen: false,
        });
      } else {
        frames.push({
          frameRolls: [tenthRow.roll1, roll2],
          isStrike: false,
          isSpare: false,
          isOpen: true,
        });
      }
    }
  }

  const hasTenFrames = frames.length === 10;

  return {
    frames,
    hasConfidentScore: hasTenFrames,
  };
}

export function computeImportedGameStats(
  rows: ImportedFrameRow[],
  fallbackScore: number
): ComputedGameStats {
  const parsed = parseFrames(rows);
  const strikes = parsed.frames.filter((frame) => frame.isStrike).length;
  const spares = parsed.frames.filter((frame) => frame.isSpare).length;
  const opens = parsed.frames.filter((frame) => frame.isOpen).length;

  const computedScore = parsed.hasConfidentScore
    ? scoreFrames(parsed.frames)
    : null;

  return {
    totalScore: computedScore ?? fallbackScore,
    strikes,
    spares,
    opens,
  };
}

export function buildImportedGameFramePreview(rows: ImportedFrameRow[]) {
  const parsed = parseFrames(rows);

  const previewFrames: ImportedPreviewFrame[] = parsed.frames.map(
    (frame, index) => ({
      frameNumber: index + 1,
      roll1: frame.frameRolls[0] ?? 0,
      roll2: frame.frameRolls.length > 1 ? (frame.frameRolls[1] ?? null) : null,
      roll3: frame.frameRolls.length > 2 ? (frame.frameRolls[2] ?? null) : null,
      pins: null,
    })
  );

  return buildGameFramePreview(previewFrames);
}
