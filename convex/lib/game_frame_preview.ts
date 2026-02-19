type FrameForPreview = {
  frameNumber: number;
  roll1: number;
  roll2?: number | null;
  roll3?: number | null;
  pins?: number | null;
};

type RollField = 'roll1Mask' | 'roll2Mask' | 'roll3Mask';

type FrameMasks = {
  roll1Mask: number | null;
  roll2Mask: number | null;
  roll3Mask: number | null;
};

export type FramePreviewItem = {
  text: string;
  hasSplit: boolean;
};

const FULL_PIN_MASK = 0x3ff;
const HEADPIN_MASK = 1;
const ROLL2_SHIFT = 10;
const ROLL3_SHIFT = 20;
const MANUAL_PIN_PACK_MARKER = 1 << 30;

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

function isSplitLeaveMask(leaveMask: number): boolean {
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

function getRollValue(mask: number | null): number | null {
  if (mask === null) {
    return null;
  }

  let working = mask & FULL_PIN_MASK;
  let count = 0;

  while (working !== 0) {
    working &= working - 1;
    count += 1;
  }

  return count;
}

function unpackManualPins(pins: number | null | undefined): FrameMasks | null {
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

function getTenthFrameRoll2StandingMask(frame: FrameMasks): number {
  const roll1 = getRollValue(frame.roll1Mask);

  if (roll1 === 10) {
    return FULL_PIN_MASK;
  }

  return FULL_PIN_MASK & ~(frame.roll1Mask ?? 0);
}

function getTenthFrameRoll3StandingMask(frame: FrameMasks): number {
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

function getStandingMaskForField(
  frameIndex: number,
  frame: FrameMasks,
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

function getLeaveMaskForRoll(
  frameIndex: number,
  frame: FrameMasks,
  field: RollField
): number | null {
  const rollMask = frame[field];

  if (rollMask === null) {
    return null;
  }

  const standingMask = getStandingMaskForField(frameIndex, frame, field);
  return standingMask & ~rollMask;
}

function getFrameHasSplit(
  frameIndex: number,
  frame: FrameForPreview | null
): boolean {
  if (!frame) {
    return false;
  }

  const masks = unpackManualPins(frame.pins);

  if (!masks) {
    return false;
  }

  const rollFields: RollField[] =
    frameIndex < 9 ? ['roll1Mask'] : ['roll1Mask', 'roll2Mask', 'roll3Mask'];

  for (const field of rollFields) {
    const leaveMask = getLeaveMaskForRoll(frameIndex, masks, field);

    if (leaveMask !== null && isSplitLeaveMask(leaveMask)) {
      return true;
    }
  }

  return false;
}

function getRollSymbol(roll: number): string {
  if (roll === 0) {
    return '-';
  }

  return String(roll);
}

function getStandardFramePreview(frame: FrameForPreview | null): string {
  if (!frame) {
    return '-';
  }

  if (frame.roll1 === 10) {
    return 'X';
  }

  if (frame.roll2 === null || frame.roll2 === undefined) {
    return getRollSymbol(frame.roll1);
  }

  if (frame.roll1 + frame.roll2 === 10) {
    return `${getRollSymbol(frame.roll1)} /`;
  }

  return `${getRollSymbol(frame.roll1)} ${getRollSymbol(frame.roll2)}`;
}

function getTenthFramePreview(frame: FrameForPreview | null): string {
  if (!frame) {
    return '-';
  }

  const roll1 = frame.roll1;
  const roll2 = frame.roll2;
  const roll3 = frame.roll3;

  const symbols: string[] = [roll1 === 10 ? 'X' : getRollSymbol(roll1)];

  if (roll2 === null || roll2 === undefined) {
    return symbols.join('');
  }

  if (roll1 === 10) {
    symbols.push(roll2 === 10 ? 'X' : getRollSymbol(roll2));
  } else {
    symbols.push(roll1 + roll2 === 10 ? '/' : getRollSymbol(roll2));
  }

  if (roll3 === null || roll3 === undefined) {
    return symbols.join(' ');
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

  return symbols.join(' ');
}

export function buildGameFramePreview(
  frames: FrameForPreview[]
): FramePreviewItem[] {
  const frameByNumber = new Map(
    frames.map((frame) => [frame.frameNumber, frame] as const)
  );

  const preview: FramePreviewItem[] = [];

  for (let frameNumber = 1; frameNumber <= 9; frameNumber += 1) {
    const frameIndex = frameNumber - 1;
    const frame = frameByNumber.get(frameNumber) ?? null;

    preview.push({
      text: getStandardFramePreview(frame),
      hasSplit: getFrameHasSplit(frameIndex, frame),
    });
  }

  const tenthFrame = frameByNumber.get(10) ?? null;
  preview.push({
    text: getTenthFramePreview(tenthFrame),
    hasSplit: getFrameHasSplit(9, tenthFrame),
  });

  return preview;
}
