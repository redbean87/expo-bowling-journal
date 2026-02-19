import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireUserId } from './lib/auth';
import { buildGameFramePreview } from './lib/game_frame_preview';

import type { Doc } from './_generated/dataModel';

type FrameInput = {
  frameNumber: number;
  roll1: number;
  roll2: number | null;
  roll3: number | null;
  pins: number | null;
};

function normalizeRequiredRoll(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    throw new ConvexError(`${label} must be an integer between 0 and 10`);
  }

  return value;
}

function normalizeRoll(
  value: number | null | undefined,
  label: string
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0 || value > 10) {
    throw new ConvexError(`${label} must be an integer between 0 and 10`);
  }

  return value;
}

function normalizePins(value: number | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0 || value > 2147483647) {
    throw new ConvexError('pins must be a packed pin mask integer');
  }

  return value;
}

function validateAndNormalizeFrames(
  frames: Array<{
    frameNumber: number;
    roll1: number;
    roll2?: number | null;
    roll3?: number | null;
    pins?: number | null;
  }>
): FrameInput[] {
  if (frames.length > 10) {
    throw new ConvexError('A game cannot contain more than 10 frames');
  }

  const normalized = frames
    .map((frame) => ({
      frameNumber: frame.frameNumber,
      roll1: normalizeRequiredRoll(frame.roll1, 'roll1'),
      roll2: normalizeRoll(frame.roll2, 'roll2'),
      roll3: normalizeRoll(frame.roll3, 'roll3'),
      pins: normalizePins(frame.pins),
    }))
    .sort((a, b) => a.frameNumber - b.frameNumber);

  for (const [index, frame] of normalized.entries()) {
    const expectedFrameNumber = index + 1;

    if (frame.frameNumber !== expectedFrameNumber) {
      throw new ConvexError(
        'Frames must be a contiguous sequence starting at frame 1'
      );
    }

    if (frame.frameNumber < 10) {
      if (frame.roll3 !== null) {
        throw new ConvexError('roll3 is only valid in frame 10');
      }

      if (frame.roll1 === 10) {
        if (frame.roll2 !== null) {
          throw new ConvexError(
            'roll2 must be empty after a strike in frames 1-9'
          );
        }

        continue;
      }

      if (frame.roll2 !== null && frame.roll1 + frame.roll2 > 10) {
        throw new ConvexError('Frame total cannot exceed 10 in frames 1-9');
      }

      continue;
    }

    if (frame.roll2 === null && frame.roll3 !== null) {
      throw new ConvexError('roll3 requires roll2 in frame 10');
    }

    if (frame.roll1 === 10) {
      if (
        frame.roll2 !== null &&
        frame.roll2 < 10 &&
        frame.roll3 !== null &&
        frame.roll2 + frame.roll3 > 10
      ) {
        throw new ConvexError(
          'Frame 10 second and third rolls cannot exceed 10 unless roll2 is strike'
        );
      }

      continue;
    }

    if (frame.roll2 !== null && frame.roll1 + frame.roll2 > 10) {
      throw new ConvexError('Frame 10 first and second rolls cannot exceed 10');
    }

    const isSpare = frame.roll2 !== null && frame.roll1 + frame.roll2 === 10;

    if (!isSpare && frame.roll3 !== null) {
      throw new ConvexError('roll3 in frame 10 requires strike or spare');
    }
  }

  return normalized;
}

function rollsAfterFrame(
  framesByNumber: Map<number, FrameInput>,
  frameNumber: number
): number[] {
  const rolls: number[] = [];

  for (let nextFrame = frameNumber + 1; nextFrame <= 10; nextFrame += 1) {
    const frame = framesByNumber.get(nextFrame);

    if (!frame) {
      break;
    }

    rolls.push(frame.roll1);

    if (nextFrame < 10) {
      if (frame.roll2 !== null) {
        rolls.push(frame.roll2);
      }

      continue;
    }

    if (frame.roll2 !== null) {
      rolls.push(frame.roll2);
    }

    if (frame.roll3 !== null) {
      rolls.push(frame.roll3);
    }
  }

  return rolls;
}

function computeGameStats(frames: FrameInput[]) {
  const framesByNumber = new Map(
    frames.map((frame) => [frame.frameNumber, frame])
  );

  let totalScore = 0;
  let strikes = 0;
  let spares = 0;
  let opens = 0;

  for (let frameNumber = 1; frameNumber <= 10; frameNumber += 1) {
    const frame = framesByNumber.get(frameNumber);

    if (!frame) {
      break;
    }

    if (frameNumber < 10) {
      if (frame.roll1 === 10) {
        const bonusRolls = rollsAfterFrame(framesByNumber, frameNumber);
        totalScore += 10 + (bonusRolls[0] ?? 0) + (bonusRolls[1] ?? 0);
        strikes += 1;
        continue;
      }

      if (frame.roll2 === null) {
        totalScore += frame.roll1;
        continue;
      }

      const frameTotal = frame.roll1 + frame.roll2;

      if (frameTotal === 10) {
        const bonusRolls = rollsAfterFrame(framesByNumber, frameNumber);
        totalScore += 10 + (bonusRolls[0] ?? 0);
        spares += 1;
        continue;
      }

      totalScore += frameTotal;
      opens += 1;
      continue;
    }

    totalScore += frame.roll1 + (frame.roll2 ?? 0) + (frame.roll3 ?? 0);

    if (frame.roll1 === 10) {
      strikes += 1;
    } else if (frame.roll2 !== null && frame.roll1 + frame.roll2 === 10) {
      spares += 1;
    } else if (frame.roll2 !== null) {
      opens += 1;
    }
  }

  return {
    totalScore,
    strikes,
    spares,
    opens,
  };
}

export const listByGame = query({
  args: {
    gameId: v.id('games'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await ctx.db.get(args.gameId);

    if (!game || game.userId !== userId) {
      throw new ConvexError('Game not found');
    }

    const frames = await ctx.db
      .query('frames')
      .withIndex('by_user_game', (q) =>
        q.eq('userId', userId).eq('gameId', args.gameId)
      )
      .collect();

    return frames.sort((left, right) => left.frameNumber - right.frameNumber);
  },
});

export const replaceForGame = mutation({
  args: {
    gameId: v.id('games'),
    frames: v.array(
      v.object({
        frameNumber: v.number(),
        roll1: v.number(),
        roll2: v.optional(v.union(v.number(), v.null())),
        roll3: v.optional(v.union(v.number(), v.null())),
        pins: v.optional(v.union(v.number(), v.null())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await ctx.db.get(args.gameId);

    if (!game || game.userId !== userId) {
      throw new ConvexError('Game not found');
    }

    const normalizedFrames = validateAndNormalizeFrames(args.frames);

    const existingFrames: Doc<'frames'>[] = await ctx.db
      .query('frames')
      .withIndex('by_user_game', (q) =>
        q.eq('userId', userId).eq('gameId', args.gameId)
      )
      .collect();

    for (const frame of existingFrames) {
      await ctx.db.delete(frame._id);
    }

    for (const frame of normalizedFrames) {
      await ctx.db.insert('frames', {
        userId,
        gameId: args.gameId,
        frameNumber: frame.frameNumber,
        roll1: frame.roll1,
        roll2: frame.roll2,
        roll3: frame.roll3,
        pins: frame.pins,
      });
    }

    const stats = computeGameStats(normalizedFrames);

    await ctx.db.patch(args.gameId, {
      ...stats,
      framePreview: buildGameFramePreview(normalizedFrames),
    });

    return args.gameId;
  },
});
