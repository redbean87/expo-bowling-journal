import {
  getRollValue,
  getStandingMaskForField,
  packManualPins,
  type FrameDraft,
  type RollField,
} from './frame-mask-utils';

import type { EditableFrameInput } from '@/services/journal';

export type FrameStatus = 'empty' | 'partial' | 'complete';

function hasAnyValue(frame: FrameDraft) {
  return (
    frame.roll1Mask !== null ||
    frame.roll2Mask !== null ||
    frame.roll3Mask !== null
  );
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
