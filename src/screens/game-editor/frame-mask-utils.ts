export type FrameDraft = {
  roll1Mask: number | null;
  roll2Mask: number | null;
  roll3Mask: number | null;
};

export type RollField = keyof FrameDraft;

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
