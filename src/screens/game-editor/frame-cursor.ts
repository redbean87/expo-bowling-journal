import {
  getRollValue,
  type FrameDraft,
  type RollField,
} from './frame-mask-utils';
import { getFrameStatus, getVisibleRollFields } from './frame-validation';

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
