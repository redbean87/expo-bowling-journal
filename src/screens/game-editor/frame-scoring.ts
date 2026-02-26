import {
  EMPTY_FRAME_DRAFT,
  getRollValue,
  type FrameDraft,
} from './frame-mask-utils';

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

export function getProvisionalTotalScore(frameDrafts: FrameDraft[]): number {
  const { frames, rolls } = parseScoreFrames(frameDrafts);
  let totalScore = 0;

  for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
    const frame = frames[frameIndex];

    if (!frame || !frame.hasStarted) {
      break;
    }

    if (frameIndex < 9) {
      if (frame.isStrike) {
        const bonusRoll1 = rolls[frame.startRollIndex + 1] ?? 0;
        const bonusRoll2 = rolls[frame.startRollIndex + 2] ?? 0;
        totalScore += 10 + bonusRoll1 + bonusRoll2;
        continue;
      }

      const roll1 = frame.rolls[0] ?? 0;
      const roll2 = frame.rolls[1] ?? null;

      if (roll2 === null) {
        totalScore += roll1;
        continue;
      }

      if (frame.isSpare) {
        const bonusRoll = rolls[frame.startRollIndex + 2] ?? 0;
        totalScore += 10 + bonusRoll;
        continue;
      }

      totalScore += roll1 + roll2;
      continue;
    }

    totalScore += frame.rolls.reduce((sum, value) => sum + value, 0);
  }

  return totalScore;
}
