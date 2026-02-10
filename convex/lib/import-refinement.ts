import type { Id } from '../_generated/dataModel';

export type LaneContextInput = {
  leftLane?: number | null;
  rightLane?: number | null;
  lanePair?: string | null;
  startingLane?: number | null;
};

export type BallSwitchInput = {
  frameNumber: number;
  rollNumber?: number | null;
  ballId?: Id<'balls'> | null;
  ballName?: string | null;
  note?: string | null;
};

export function normalizeOptionalText(
  value: string | null | undefined,
  maxLength = 2000
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.slice(0, maxLength);
}

export function normalizeNullableInteger(
  value: number | null | undefined,
  min: number,
  max: number
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value < min || value > max) {
    return null;
  }

  return value;
}

export function laneContextFromLane(
  lane: number | null | undefined
): LaneContextInput | null {
  const normalizedLane = normalizeNullableInteger(lane, 1, 99);

  if (normalizedLane === null) {
    return null;
  }

  return {
    startingLane: normalizedLane,
    lanePair: `${normalizedLane}/${normalizedLane + 1}`,
    leftLane: normalizedLane,
    rightLane: normalizedLane + 1,
  };
}

export function normalizeLaneContext(
  laneContext: LaneContextInput | null | undefined,
  warnings: string[],
  label: string
): LaneContextInput | null {
  if (laneContext === undefined || laneContext === null) {
    return null;
  }

  const leftLane = normalizeNullableInteger(laneContext.leftLane, 1, 99);
  const rightLane = normalizeNullableInteger(laneContext.rightLane, 1, 99);
  const startingLane = normalizeNullableInteger(
    laneContext.startingLane,
    1,
    99
  );
  const lanePair = normalizeOptionalText(laneContext.lanePair, 32);

  if (laneContext.leftLane !== undefined && leftLane === null) {
    warnings.push(`${label}: leftLane must be an integer between 1 and 99`);
  }

  if (laneContext.rightLane !== undefined && rightLane === null) {
    warnings.push(`${label}: rightLane must be an integer between 1 and 99`);
  }

  if (laneContext.startingLane !== undefined && startingLane === null) {
    warnings.push(`${label}: startingLane must be an integer between 1 and 99`);
  }

  const normalized: LaneContextInput = {
    leftLane,
    rightLane,
    startingLane,
    lanePair,
  };

  if (
    normalized.leftLane === null &&
    normalized.rightLane === null &&
    normalized.startingLane === null &&
    normalized.lanePair === null
  ) {
    return null;
  }

  return normalized;
}

export function normalizeBallSwitches(
  ballSwitches: BallSwitchInput[] | null | undefined,
  warnings: string[],
  label: string
): BallSwitchInput[] | null {
  if (ballSwitches === undefined || ballSwitches === null) {
    return null;
  }

  const normalized: BallSwitchInput[] = [];

  for (const [index, ballSwitch] of ballSwitches.entries()) {
    const entryLabel = `${label}: ballSwitches[${index}]`;
    const frameNumber = normalizeNullableInteger(ballSwitch.frameNumber, 1, 10);

    if (frameNumber === null) {
      warnings.push(`${entryLabel} has invalid frameNumber; entry skipped`);
      continue;
    }

    const rollNumber = normalizeNullableInteger(ballSwitch.rollNumber, 1, 3);

    if (ballSwitch.rollNumber !== undefined && rollNumber === null) {
      warnings.push(`${entryLabel} has invalid rollNumber; rollNumber cleared`);
    }

    normalized.push({
      frameNumber,
      rollNumber,
      ballId: ballSwitch.ballId ?? null,
      ballName: normalizeOptionalText(ballSwitch.ballName, 120),
      note: normalizeOptionalText(ballSwitch.note, 200),
    });
  }

  if (normalized.length === 0) {
    return null;
  }

  return normalized.sort((left, right) => left.frameNumber - right.frameNumber);
}
