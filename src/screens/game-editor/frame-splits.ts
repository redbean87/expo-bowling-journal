import {
  FULL_PIN_MASK,
  getStandingMaskForField,
  type FrameDraft,
  type RollField,
} from './frame-mask-utils';

const HEADPIN_MASK = 1;

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
