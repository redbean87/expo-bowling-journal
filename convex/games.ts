import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireUserId } from './lib/auth';
import { buildGameFramePreview } from './lib/game_frame_preview';

export const listBySession = query({
  args: {
    sessionId: v.id('sessions'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const games = await ctx.db
      .query('games')
      .withIndex('by_user_session', (q) =>
        q.eq('userId', userId).eq('sessionId', args.sessionId)
      )
      .collect();

    const sortedGames = games.sort((left, right) => {
      if (left.date !== right.date) {
        return right.date.localeCompare(left.date);
      }

      return right._creationTime - left._creationTime;
    });

    return Promise.all(
      sortedGames.map(async (game) => {
        const frames = await ctx.db
          .query('frames')
          .withIndex('by_user_game', (q) =>
            q.eq('userId', userId).eq('gameId', game._id)
          )
          .collect();

        const sortedFrames = frames.sort(
          (left, right) => left.frameNumber - right.frameNumber
        );

        return {
          ...game,
          framePreview: buildGameFramePreview(sortedFrames),
        };
      })
    );
  },
});

export const getById = query({
  args: {
    gameId: v.id('games'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await ctx.db.get(args.gameId);

    if (!game || game.userId !== userId) {
      throw new ConvexError('Game not found');
    }

    return game;
  },
});

export const create = mutation({
  args: {
    sessionId: v.id('sessions'),
    date: v.string(),
    ballId: v.optional(v.union(v.id('balls'), v.null())),
    patternId: v.optional(v.union(v.id('patterns'), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const session = await ctx.db.get(args.sessionId);

    if (!session || session.userId !== userId) {
      throw new ConvexError('Session not found');
    }

    if (args.ballId) {
      const ball = await ctx.db.get(args.ballId);

      if (!ball || ball.userId !== userId) {
        throw new ConvexError('Ball not found');
      }
    }

    if (args.patternId) {
      const pattern = await ctx.db.get(args.patternId);

      if (!pattern) {
        throw new ConvexError('Pattern not found');
      }
    }

    return ctx.db.insert('games', {
      userId,
      sessionId: args.sessionId,
      leagueId: session.leagueId,
      date: args.date,
      totalScore: 0,
      strikes: 0,
      spares: 0,
      opens: 0,
      ballId: args.ballId ?? null,
      patternId: args.patternId ?? null,
    });
  },
});

export const update = mutation({
  args: {
    gameId: v.id('games'),
    date: v.string(),
    ballId: v.optional(v.union(v.id('balls'), v.null())),
    patternId: v.optional(v.union(v.id('patterns'), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const game = await ctx.db.get(args.gameId);

    if (!game || game.userId !== userId) {
      throw new ConvexError('Game not found');
    }

    if (args.ballId) {
      const ball = await ctx.db.get(args.ballId);

      if (!ball || ball.userId !== userId) {
        throw new ConvexError('Ball not found');
      }
    }

    if (args.patternId) {
      const pattern = await ctx.db.get(args.patternId);

      if (!pattern) {
        throw new ConvexError('Pattern not found');
      }
    }

    await ctx.db.patch(args.gameId, {
      date: args.date,
      ballId: args.ballId ?? null,
      patternId: args.patternId ?? null,
    });

    return args.gameId;
  },
});
