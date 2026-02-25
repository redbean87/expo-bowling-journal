import type { EditableFrameInput } from '@/services/journal';

export type FrameDraft = {
  roll1Mask: number | null;
  roll2Mask: number | null;
  roll3Mask: number | null;
};

export type RollField = keyof FrameDraft;

export type FrameStatus = 'empty' | 'partial' | 'complete';

export const FULL_PIN_MASK = 0x3ff;
const HEADPIN_MASK = 1;

const ROLL2_SHIFT = 10;
const ROLL3_SHIFT = 20;
const MANUAL_PIN_PACK_MARKER = 1 << 30;

export const EMPTY_FRAME_DRAFT: FrameDraft = {
  roll1Mask: null,
  roll2Mask: null,
  roll3Mask: null,
};

export const EMPTY_FRAMES: FrameDraft[] = Array.from({ length: 10 }, () => ({
  ...EMPTY_FRAME_DRAFT,
}));

export function getFirstParam(
  value: string | string[] | undefined
): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function normalizeDateValue(value: string) {
  return value.slice(0, 10);
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

function normalizeMask(value: number | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0 || value > FULL_PIN_MASK) {
    return null;
  }

  return value;
}

function maskFromCount(count: number | null | undefined): number | null {
  if (count === undefined || count === null) {
    return null;
  }

  if (!Number.isInteger(count) || count < 0 || count > 10) {
    return null;
  }

  if (count === 0) {
    return 0;
  }

  return (1 << count) - 1;
}

function maskFromCountWithinStanding(
  count: number | null | undefined,
  standingMask: number
): number | null {
  if (count === undefined || count === null) {
    return null;
  }

  if (!Number.isInteger(count) || count < 0 || count > 10) {
    return null;
  }

  if (count === 0) {
    return 0;
  }

  let remaining = count;
  let result = 0;

  for (let bit = 0; bit < 10 && remaining > 0; bit += 1) {
    const pinBit = 1 << bit;

    if ((standingMask & pinBit) !== 0) {
      result |= pinBit;
      remaining -= 1;
    }
  }

  if (remaining > 0) {
    return standingMask;
  }

  return result;
}

function resolveMaskFromStoredRoll(
  mask: number | null,
  roll: number | null | undefined,
  standingMask: number
): number | null {
  const rollMask = maskFromCountWithinStanding(roll, standingMask);

  if (rollMask === null) {
    return null;
  }

  if (mask === null) {
    return rollMask;
  }

  if (bitCount(mask) === roll && (mask & ~standingMask) === 0) {
    return mask;
  }

  return rollMask;
}

export function getRollValue(mask: number | null): number | null {
  if (mask === null) {
    return null;
  }

  return bitCount(mask);
}

export function packManualPins(frame: FrameDraft): number {
  const roll1Mask = frame.roll1Mask ?? 0;
  const roll2Mask = frame.roll2Mask ?? 0;
  const roll3Mask = frame.roll3Mask ?? 0;

  return (
    MANUAL_PIN_PACK_MARKER |
    roll1Mask |
    (roll2Mask << ROLL2_SHIFT) |
    (roll3Mask << ROLL3_SHIFT)
  );
}

function unpackManualPins(pins: number | null | undefined): FrameDraft | null {
  if (pins === undefined || pins === null) {
    return null;
  }

  if (!Number.isInteger(pins) || pins < 0) {
    return null;
  }

  if ((pins & MANUAL_PIN_PACK_MARKER) === 0) {
    return null;
  }

  const packedRollMasks = pins & ~MANUAL_PIN_PACK_MARKER;
  const roll1Mask = packedRollMasks & FULL_PIN_MASK;
  const roll2Mask = (packedRollMasks >> ROLL2_SHIFT) & FULL_PIN_MASK;
  const roll3Mask = (packedRollMasks >> ROLL3_SHIFT) & FULL_PIN_MASK;

  return {
    roll1Mask,
    roll2Mask,
    roll3Mask,
  };
}

export function toFrameDrafts(
  frames: Array<{
    frameNumber: number;
    roll1: number;
    roll2?: number | null;
    roll3?: number | null;
    pins?: number | null;
  }>
): FrameDraft[] {
  const drafts = Array.from({ length: 10 }, () => ({ ...EMPTY_FRAME_DRAFT }));

  for (const frame of frames) {
    const index = frame.frameNumber - 1;

    if (index < 0 || index >= drafts.length) {
      continue;
    }

    const unpacked = unpackManualPins(frame.pins);

    if (unpacked) {
      const roll1Mask = resolveMaskFromStoredRoll(
        normalizeMask(unpacked.roll1Mask),
        frame.roll1,
        FULL_PIN_MASK
      );
      const roll2StandingMask = getStandingMaskForField(
        index,
        {
          roll1Mask,
          roll2Mask: null,
          roll3Mask: null,
        },
        'roll2Mask'
      );
      const roll2Mask = resolveMaskFromStoredRoll(
        normalizeMask(unpacked.roll2Mask),
        frame.roll2,
        roll2StandingMask
      );
      const roll3StandingMask = getStandingMaskForField(
        index,
        {
          roll1Mask,
          roll2Mask,
          roll3Mask: null,
        },
        'roll3Mask'
      );

      drafts[index] = {
        roll1Mask,
        roll2Mask,
        roll3Mask: resolveMaskFromStoredRoll(
          normalizeMask(unpacked.roll3Mask),
          frame.roll3,
          roll3StandingMask
        ),
      };
      continue;
    }

    drafts[index] = {
      roll1Mask: maskFromCount(frame.roll1),
      roll2Mask: maskFromCount(frame.roll2),
      roll3Mask: maskFromCount(frame.roll3),
    };
  }

  return drafts;
}

function hasAnyValue(frame: FrameDraft) {
  return (
    frame.roll1Mask !== null ||
    frame.roll2Mask !== null ||
    frame.roll3Mask !== null
  );
}

function getTenthFrameRoll2StandingMask(frame: FrameDraft): number {
  const roll1 = getRollValue(frame.roll1Mask);

  if (roll1 === 10) {
    return FULL_PIN_MASK;
  }

  return FULL_PIN_MASK & ~(frame.roll1Mask ?? 0);
}

function getTenthFrameRoll3StandingMask(frame: FrameDraft): number {
  const roll1 = getRollValue(frame.roll1Mask);
  const roll2 = getRollValue(frame.roll2Mask);

  if (roll1 === 10) {
    if (roll2 === 10) {
      return FULL_PIN_MASK;
    }

    return FULL_PIN_MASK & ~(frame.roll2Mask ?? 0);
  }

  if (roll1 !== null && roll2 !== null && roll1 < 10 && roll1 + roll2 === 10) {
    return FULL_PIN_MASK;
  }

  return FULL_PIN_MASK;
}

export function getStandingMaskForField(
  frameIndex: number,
  frame: FrameDraft,
  field: RollField
): number {
  if (field === 'roll1Mask') {
    return FULL_PIN_MASK;
  }

  if (frameIndex < 9) {
    return FULL_PIN_MASK & ~(frame.roll1Mask ?? 0);
  }

  if (field === 'roll2Mask') {
    return getTenthFrameRoll2StandingMask(frame);
  }

  return getTenthFrameRoll3StandingMask(frame);
}

function validateFrameMasks(
  frameIndex: number,
  frame: FrameDraft
): string | null {
  const roll1 = getRollValue(frame.roll1Mask);
  const roll2 = getRollValue(frame.roll2Mask);

  if (frame.roll2Mask !== null && frame.roll1Mask === null) {
    return `Frame ${frameIndex + 1}: enter roll 1 first.`;
  }

  if (frame.roll3Mask !== null && frame.roll2Mask === null) {
    return `Frame ${frameIndex + 1}: enter roll 2 before roll 3.`;
  }

  if (frameIndex < 9) {
    if (roll1 === 10 && frame.roll2Mask !== null) {
      return `Frame ${frameIndex + 1}: strike skips roll 2.`;
    }

    const roll2StandingMask = getStandingMaskForField(
      frameIndex,
      frame,
      'roll2Mask'
    );

    if ((frame.roll2Mask ?? 0) & ~roll2StandingMask) {
      return `Frame ${frameIndex + 1}: roll 2 can only knock standing pins.`;
    }

    if (frame.roll3Mask !== null) {
      return `Frame ${frameIndex + 1}: roll 3 is only used in frame 10.`;
    }

    if (roll1 !== null && roll2 !== null && roll1 + roll2 > 10) {
      return `Frame ${frameIndex + 1}: roll 1 + roll 2 cannot exceed 10.`;
    }

    return null;
  }

  if (roll1 !== null && roll2 !== null && roll1 < 10 && roll1 + roll2 > 10) {
    return 'Frame 10: roll 1 + roll 2 cannot exceed 10 unless roll 1 is a strike.';
  }

  if (frame.roll3Mask !== null) {
    const roll3StandingMask = getStandingMaskForField(
      frameIndex,
      frame,
      'roll3Mask'
    );

    if (frame.roll3Mask & ~roll3StandingMask) {
      return 'Frame 10: roll 3 can only knock standing pins for that bonus ball.';
    }
  }

  const canHaveRoll3 =
    roll1 === 10 ||
    (roll1 !== null && roll2 !== null && roll1 < 10 && roll1 + roll2 === 10);

  if (frame.roll3Mask !== null && !canHaveRoll3) {
    return 'Frame 10: roll 3 is only available after a strike or spare.';
  }

  return null;
}

export function buildFramesPayload(
  frameDrafts: FrameDraft[]
): EditableFrameInput[] {
  const frames: EditableFrameInput[] = [];
  let reachedEnd = false;

  for (const [index, frame] of frameDrafts.entries()) {
    const frameNumber = index + 1;

    if (!hasAnyValue(frame)) {
      reachedEnd = true;
      continue;
    }

    if (reachedEnd) {
      throw new Error('Frames must be entered in order with no gaps.');
    }

    if (frame.roll1Mask === null) {
      throw new Error(`Frame ${frameNumber}: roll1 is required.`);
    }

    const validationError = validateFrameMasks(index, frame);

    if (validationError) {
      throw new Error(validationError);
    }

    frames.push({
      frameNumber,
      roll1: getRollValue(frame.roll1Mask) ?? 0,
      roll2: getRollValue(frame.roll2Mask),
      roll3: getRollValue(frame.roll3Mask),
      pins: packManualPins(frame),
    });
  }

  return frames;
}

export function getVisibleRollFields(
  frameIndex: number,
  frame: FrameDraft
): RollField[] {
  const roll1 = getRollValue(frame.roll1Mask);
  const roll2 = getRollValue(frame.roll2Mask);

  if (frameIndex < 9) {
    if (roll1 === 10) {
      return ['roll1Mask'];
    }

    return ['roll1Mask', 'roll2Mask'];
  }

  const fields: RollField[] = ['roll1Mask'];

  if (roll1 !== null) {
    fields.push('roll2Mask');
  }

  const hasBonusRoll =
    roll1 === 10 ||
    (roll1 !== null && roll2 !== null && roll1 < 10 && roll1 + roll2 === 10);

  if (hasBonusRoll) {
    fields.push('roll3Mask');
  }

  return fields;
}

function isFrameComplete(frameIndex: number, frame: FrameDraft): boolean {
  if (!hasAnyValue(frame)) {
    return false;
  }

  const roll1 = getRollValue(frame.roll1Mask);
  const roll2 = getRollValue(frame.roll2Mask);
  const roll3 = getRollValue(frame.roll3Mask);

  if (frameIndex < 9) {
    if (roll1 === 10) {
      return true;
    }

    return roll1 !== null && roll2 !== null;
  }

  if (roll1 === null || roll2 === null) {
    return false;
  }

  const needsBonusRoll = roll1 === 10 || (roll1 < 10 && roll1 + roll2 === 10);

  if (!needsBonusRoll) {
    return true;
  }

  return roll3 !== null;
}

export function getFrameStatus(
  frameIndex: number,
  frame: FrameDraft
): FrameStatus {
  if (!hasAnyValue(frame)) {
    return 'empty';
  }

  if (isFrameComplete(frameIndex, frame)) {
    return 'complete';
  }

  return 'partial';
}

function getRollSymbol(value: number): string {
  if (value === 0) {
    return '-';
  }

  return String(value);
}

const PIN_ADJACENCY: Record<number, readonly number[]> = {
  1: [2, 3],
  2: [1, 3, 4, 5],
  3: [1, 2, 5, 6],
  4: [2, 5, 7, 8],
  5: [2, 3, 4, 6, 8, 9],
  6: [3, 5, 9, 10],
  7: [4, 8],
  8: [4, 5, 7, 9],
  9: [5, 6, 8, 10],
  10: [6, 9],
};

function getStandingPinNumbers(mask: number): number[] {
  const standingPins: number[] = [];

  for (let pinNumber = 1; pinNumber <= 10; pinNumber += 1) {
    if ((mask & (1 << (pinNumber - 1))) !== 0) {
      standingPins.push(pinNumber);
    }
  }

  return standingPins;
}

function getConnectedClusterCount(mask: number): number {
  const standingPins = getStandingPinNumbers(mask);

  if (standingPins.length === 0) {
    return 0;
  }

  const standingSet = new Set(standingPins);
  const visited = new Set<number>();
  let clusters = 0;

  for (const pinNumber of standingPins) {
    if (visited.has(pinNumber)) {
      continue;
    }

    clusters += 1;
    const queue = [pinNumber];
    visited.add(pinNumber);

    while (queue.length > 0) {
      const current = queue.shift();

      if (!current) {
        continue;
      }

      for (const neighbor of PIN_ADJACENCY[current] ?? []) {
        if (!standingSet.has(neighbor) || visited.has(neighbor)) {
          continue;
        }

        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return clusters;
}

export function isSplitLeaveMask(leaveMask: number): boolean {
  if (
    !Number.isInteger(leaveMask) ||
    leaveMask < 0 ||
    leaveMask > FULL_PIN_MASK
  ) {
    return false;
  }

  if (leaveMask === 0) {
    return false;
  }

  if ((leaveMask & HEADPIN_MASK) !== 0) {
    return false;
  }

  return getConnectedClusterCount(leaveMask) >= 2;
}

function getLeaveMaskForRoll(
  frameIndex: number,
  frame: FrameDraft,
  field: RollField
): number | null {
  const rollMask = frame[field];

  if (rollMask === null) {
    return null;
  }

  const standingMask = getStandingMaskForField(frameIndex, frame, field);
  return standingMask & ~rollMask;
}

function isSplitForRoll(
  frameIndex: number,
  frame: FrameDraft,
  field: RollField
): boolean {
  const leaveMask = getLeaveMaskForRoll(frameIndex, frame, field);

  if (leaveMask === null) {
    return false;
  }

  return isSplitLeaveMask(leaveMask);
}

export type FrameSplitFlags = {
  roll1: boolean;
  roll2: boolean;
  roll3: boolean;
};

export function getFrameSplitFlags(
  frameIndex: number,
  frame: FrameDraft
): FrameSplitFlags {
  if (frameIndex < 9) {
    return {
      roll1: isSplitForRoll(frameIndex, frame, 'roll1Mask'),
      roll2: false,
      roll3: false,
    };
  }

  return {
    roll1: isSplitForRoll(frameIndex, frame, 'roll1Mask'),
    roll2: isSplitForRoll(frameIndex, frame, 'roll2Mask'),
    roll3: isSplitForRoll(frameIndex, frame, 'roll3Mask'),
  };
}

function getStandardFrameSymbolParts(frame: FrameDraft): string[] {
  const roll1 = getRollValue(frame.roll1Mask);
  const roll2 = getRollValue(frame.roll2Mask);

  if (roll1 === null) {
    return [];
  }

  if (roll1 === 10) {
    return ['X'];
  }

  if (roll2 === null) {
    return [getRollSymbol(roll1)];
  }

  const secondSymbol = roll1 + roll2 === 10 ? '/' : getRollSymbol(roll2);

  return [getRollSymbol(roll1), secondSymbol];
}

function getTenthFrameSymbolParts(frame: FrameDraft): string[] {
  const roll1 = getRollValue(frame.roll1Mask);
  const roll2 = getRollValue(frame.roll2Mask);
  const roll3 = getRollValue(frame.roll3Mask);

  if (roll1 === null) {
    return [];
  }

  const symbols: string[] = [roll1 === 10 ? 'X' : getRollSymbol(roll1)];

  if (roll2 === null) {
    return symbols;
  }

  if (roll1 === 10) {
    symbols.push(roll2 === 10 ? 'X' : getRollSymbol(roll2));
  } else {
    symbols.push(roll1 + roll2 === 10 ? '/' : getRollSymbol(roll2));
  }

  if (roll3 === null) {
    return symbols;
  }

  if (roll1 === 10) {
    if (roll2 === 10) {
      symbols.push(roll3 === 10 ? 'X' : getRollSymbol(roll3));
    } else {
      symbols.push(roll2 + roll3 === 10 ? '/' : getRollSymbol(roll3));
    }
  } else if (roll1 + roll2 === 10) {
    symbols.push(roll3 === 10 ? 'X' : getRollSymbol(roll3));
  } else {
    symbols.push(getRollSymbol(roll3));
  }

  return symbols;
}

export function getFrameSymbolParts(
  frameIndex: number,
  frame: FrameDraft
): string[] {
  if (frameIndex < 9) {
    return getStandardFrameSymbolParts(frame);
  }

  return getTenthFrameSymbolParts(frame);
}

export function getFrameSymbolSummary(
  frameIndex: number,
  frame: FrameDraft
): string {
  return getFrameSymbolParts(frameIndex, frame).join('');
}

type ParsedScoreFrame = {
  hasStarted: boolean;
  isComplete: boolean;
  isStrike: boolean;
  isSpare: boolean;
  startRollIndex: number;
  rolls: number[];
};

function parseScoreFrames(frameDrafts: FrameDraft[]): {
  frames: ParsedScoreFrame[];
  rolls: number[];
} {
  const rolls: number[] = [];
  const frames: ParsedScoreFrame[] = [];

  for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
    const frame = frameDrafts[frameIndex] ?? EMPTY_FRAME_DRAFT;
    const roll1 = getRollValue(frame.roll1Mask);
    const roll2 = getRollValue(frame.roll2Mask);
    const roll3 = getRollValue(frame.roll3Mask);
    const startRollIndex = rolls.length;

    if (roll1 === null) {
      frames.push({
        hasStarted: false,
        isComplete: false,
        isStrike: false,
        isSpare: false,
        startRollIndex,
        rolls: [],
      });
      continue;
    }

    if (frameIndex < 9) {
      if (roll1 === 10) {
        rolls.push(10);
        frames.push({
          hasStarted: true,
          isComplete: true,
          isStrike: true,
          isSpare: false,
          startRollIndex,
          rolls: [10],
        });
        continue;
      }

      rolls.push(roll1);

      if (roll2 === null) {
        frames.push({
          hasStarted: true,
          isComplete: false,
          isStrike: false,
          isSpare: false,
          startRollIndex,
          rolls: [roll1],
        });
        continue;
      }

      const secondRoll = Math.min(roll2, 10 - roll1);
      rolls.push(secondRoll);
      frames.push({
        hasStarted: true,
        isComplete: true,
        isStrike: false,
        isSpare: roll1 + secondRoll === 10,
        startRollIndex,
        rolls: [roll1, secondRoll],
      });
      continue;
    }

    rolls.push(roll1);

    if (roll2 === null) {
      frames.push({
        hasStarted: true,
        isComplete: false,
        isStrike: false,
        isSpare: false,
        startRollIndex,
        rolls: [roll1],
      });
      continue;
    }

    rolls.push(roll2);
    const hasBonusRoll = roll1 === 10 || roll1 + roll2 === 10;

    if (hasBonusRoll) {
      if (roll3 === null) {
        frames.push({
          hasStarted: true,
          isComplete: false,
          isStrike: roll1 === 10,
          isSpare: roll1 !== 10 && roll1 + roll2 === 10,
          startRollIndex,
          rolls: [roll1, roll2],
        });
        continue;
      }

      rolls.push(roll3);
      frames.push({
        hasStarted: true,
        isComplete: true,
        isStrike: roll1 === 10,
        isSpare: roll1 !== 10 && roll1 + roll2 === 10,
        startRollIndex,
        rolls: [roll1, roll2, roll3],
      });
      continue;
    }

    frames.push({
      hasStarted: true,
      isComplete: true,
      isStrike: false,
      isSpare: false,
      startRollIndex,
      rolls: [roll1, roll2],
    });
  }

  return { frames, rolls };
}

export function getSettledRunningTotals(
  frameDrafts: FrameDraft[]
): Array<number | null> {
  const totals: Array<number | null> = Array.from({ length: 10 }, () => null);
  const { frames, rolls } = parseScoreFrames(frameDrafts);
  let runningTotal = 0;

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const frame = frames[frameIndex];

    if (!frame || !frame.hasStarted || !frame.isComplete) {
      continue;
    }

    if (frameIndex === 9) {
      runningTotal += frame.rolls.reduce((sum, value) => sum + value, 0);
      totals[frameIndex] = runningTotal;
      continue;
    }

    if (frame.isStrike) {
      const bonusRoll1 = rolls[frame.startRollIndex + 1];
      const bonusRoll2 = rolls[frame.startRollIndex + 2];

      if (bonusRoll1 === undefined || bonusRoll2 === undefined) {
        continue;
      }

      runningTotal += 10 + bonusRoll1 + bonusRoll2;
      totals[frameIndex] = runningTotal;
      continue;
    }

    if (frame.isSpare) {
      const bonusRoll = rolls[frame.startRollIndex + 2];

      if (bonusRoll === undefined) {
        continue;
      }

      runningTotal += 10 + bonusRoll;
      totals[frameIndex] = runningTotal;
      continue;
    }

    runningTotal += frame.rolls[0]! + frame.rolls[1]!;
    totals[frameIndex] = runningTotal;
  }

  return totals;
}

export function sanitizeFrameDraftsForEntry(frameDrafts: FrameDraft[]): {
  drafts: FrameDraft[];
  changed: boolean;
} {
  let changed = false;

  const drafts = frameDrafts.map((frame, index) => {
    if (index < 9) {
      const roll1 = getRollValue(frame.roll1Mask);
      const shouldClearRoll2 = roll1 === 10;
      const nextRoll2Mask = shouldClearRoll2 ? null : frame.roll2Mask;

      if (nextRoll2Mask === frame.roll2Mask && frame.roll3Mask === null) {
        return frame;
      }

      changed = true;

      return {
        ...frame,
        roll2Mask: nextRoll2Mask,
        roll3Mask: null,
      };
    }

    const roll1 = getRollValue(frame.roll1Mask);
    const roll2 = getRollValue(frame.roll2Mask);
    const canHaveRoll3 =
      roll1 === 10 ||
      (roll1 !== null && roll2 !== null && roll1 < 10 && roll1 + roll2 === 10);
    const shouldClearRoll3 = frame.roll2Mask === null || !canHaveRoll3;
    const nextRoll3Mask = shouldClearRoll3 ? null : frame.roll3Mask;

    if (nextRoll3Mask === frame.roll3Mask) {
      return frame;
    }

    changed = true;

    return {
      ...frame,
      roll3Mask: nextRoll3Mask,
    };
  });

  return { drafts, changed };
}

export function findSuggestedFrameIndex(frameDrafts: FrameDraft[]): number {
  for (const [index, frame] of frameDrafts.entries()) {
    if (getFrameStatus(index, frame) !== 'complete') {
      return index;
    }
  }

  return 9;
}

export function getPreferredRollField(
  frameIndex: number,
  frame: FrameDraft
): RollField {
  const fields = getVisibleRollFields(frameIndex, frame);

  for (const field of fields) {
    if (frame[field] === null) {
      return field;
    }
  }

  return fields[fields.length - 1] ?? 'roll1Mask';
}

export function getFrameInlineError(
  frameIndex: number,
  frame: FrameDraft
): string | null {
  return validateFrameMasks(frameIndex, frame);
}

export function findFirstFrameError(frameDrafts: FrameDraft[]): {
  frameIndex: number;
  message: string;
} | null {
  for (const [index, frame] of frameDrafts.entries()) {
    const error = getFrameInlineError(index, frame);

    if (error) {
      return { frameIndex: index, message: error };
    }
  }

  return null;
}

export function getNextCursorAfterEntry(
  frameIndex: number,
  field: RollField,
  frame: FrameDraft
): { frameIndex: number; field: RollField } | null {
  const roll1 = getRollValue(frame.roll1Mask);
  const roll2 = getRollValue(frame.roll2Mask);

  if (field === 'roll1Mask') {
    if (frameIndex < 9 && roll1 === 10) {
      return frameIndex < 9
        ? { frameIndex: frameIndex + 1, field: 'roll1Mask' }
        : null;
    }

    return { frameIndex, field: 'roll2Mask' };
  }

  if (field === 'roll2Mask') {
    if (frameIndex < 9) {
      return frameIndex < 9
        ? { frameIndex: frameIndex + 1, field: 'roll1Mask' }
        : null;
    }

    const hasBonusRoll =
      roll1 === 10 ||
      (roll1 !== null && roll2 !== null && roll1 < 10 && roll1 + roll2 === 10);

    if (hasBonusRoll) {
      return { frameIndex, field: 'roll3Mask' };
    }

    return null;
  }

  if (field === 'roll3Mask' && frameIndex < 9) {
    return { frameIndex: frameIndex + 1, field: 'roll1Mask' };
  }

  return null;
}
