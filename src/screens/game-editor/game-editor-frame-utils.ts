import type { EditableFrameInput } from '@/services/journal';

export type FrameDraft = {
  roll1Mask: number | null;
  roll2Mask: number | null;
  roll3Mask: number | null;
};

export type RollField = keyof FrameDraft;

export type FrameStatus = 'empty' | 'partial' | 'complete';

export const FULL_PIN_MASK = 0x3ff;

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
      drafts[index] = {
        roll1Mask: normalizeMask(unpacked.roll1Mask),
        roll2Mask: normalizeMask(unpacked.roll2Mask),
        roll3Mask: normalizeMask(unpacked.roll3Mask),
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

export function sanitizeFrameDraftsForEntry(frameDrafts: FrameDraft[]): {
  drafts: FrameDraft[];
  changed: boolean;
} {
  let changed = false;

  const drafts = frameDrafts.map((frame, index) => {
    if (index === 9) {
      return frame;
    }

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
  });

  return { drafts, changed };
}

export function getTenthFrameHint(
  frameIndex: number,
  frame: FrameDraft,
  activeField: RollField
): string | null {
  if (frameIndex !== 9) {
    return null;
  }

  const roll1 = getRollValue(frame.roll1Mask);
  const roll2 = getRollValue(frame.roll2Mask);

  if (activeField === 'roll1Mask') {
    return 'Strike or spare unlocks bonus roll.';
  }

  if (activeField === 'roll2Mask') {
    if (roll1 === 10) {
      return 'Bonus setup: strike gives a fresh rack.';
    }

    return 'Spare earns the bonus roll.';
  }

  if (roll1 === 10 && roll2 === 10) {
    return 'Third roll after double strike.';
  }

  return 'Bonus roll.';
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
