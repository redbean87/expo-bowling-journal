const FULL_PIN_MASK = 0x3ff;
const SECOND_ROLL_SHIFT = 10;
const MANUAL_PIN_PACK_MARKER = 1 << 30;

export type ExportableFrameDoc = {
  frameNumber: number;
  roll1: number;
  roll2?: number | null;
  roll3?: number | null;
  pins?: number | null;
};

function maskFromStandingCount(standingCount: number) {
  if (standingCount <= 0) {
    return 0;
  }

  if (standingCount >= 10) {
    return FULL_PIN_MASK;
  }

  return (1 << standingCount) - 1;
}

export function packPinsFromRolls(roll1: number, roll2: number | null) {
  const standingAfterRoll1 = Math.max(0, Math.min(10, 10 - roll1));
  const secondRoll = roll2 ?? 0;
  const standingAfterRoll2 = Math.max(
    0,
    Math.min(standingAfterRoll1, standingAfterRoll1 - secondRoll)
  );
  const firstMask = maskFromStandingCount(standingAfterRoll1);
  const secondMask = maskFromStandingCount(standingAfterRoll2);

  return firstMask | (secondMask << SECOND_ROLL_SHIFT);
}

export function toLegacyPackedPins(sourcePins: number | null | undefined) {
  if (sourcePins === undefined || sourcePins === null) {
    return null;
  }

  if ((sourcePins & MANUAL_PIN_PACK_MARKER) === 0) {
    return sourcePins;
  }

  const roll1Mask = sourcePins & FULL_PIN_MASK;
  const roll2Mask = (sourcePins >> SECOND_ROLL_SHIFT) & FULL_PIN_MASK;
  const standingAfterRoll1Mask = FULL_PIN_MASK & ~roll1Mask;
  const standingAfterRoll2Mask = standingAfterRoll1Mask & ~roll2Mask;

  return standingAfterRoll1Mask | (standingAfterRoll2Mask << SECOND_ROLL_SHIFT);
}

export function frameHasSpare(frame: ExportableFrameDoc) {
  return (
    frame.roll2 !== undefined &&
    frame.roll2 !== null &&
    frame.roll1 < 10 &&
    frame.roll1 + frame.roll2 === 10
  );
}

export function countLegacyRowsForGameFrames(frames: ExportableFrameDoc[]) {
  const byFrameNumber = new Map<number, ExportableFrameDoc>();

  for (const frame of frames) {
    byFrameNumber.set(frame.frameNumber, frame);
  }

  let count = 0;

  for (let frameNumber = 1; frameNumber <= 9; frameNumber += 1) {
    if (byFrameNumber.get(frameNumber)) {
      count += 1;
    }
  }

  const tenthFrame = byFrameNumber.get(10);

  if (!tenthFrame) {
    return count;
  }

  count += 1;

  if (tenthFrame.roll1 === 10) {
    if (tenthFrame.roll2 !== undefined && tenthFrame.roll2 !== null) {
      count += 1;
    }

    if (tenthFrame.roll3 !== undefined && tenthFrame.roll3 !== null) {
      count += 1;
    }

    return count;
  }

  if (frameHasSpare(tenthFrame)) {
    if (tenthFrame.roll3 !== undefined && tenthFrame.roll3 !== null) {
      count += 1;
    }
  }

  return count;
}
