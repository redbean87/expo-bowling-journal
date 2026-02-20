import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireUserId } from './lib/auth';

export const listByLeague = query({
  args: {
    leagueId: v.id('leagues'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_user_league', (q) =>
        q.eq('userId', userId).eq('leagueId', args.leagueId)
      )
      .collect();

    return sessions.sort((left, right) => {
      if (left.date !== right.date) {
        return right.date.localeCompare(left.date);
      }

      return right._creationTime - left._creationTime;
    });
  },
});

export const create = mutation({
  args: {
    leagueId: v.id('leagues'),
    weekNumber: v.optional(v.union(v.number(), v.null())),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const league = await ctx.db.get(args.leagueId);

    if (!league || league.userId !== userId) {
      throw new ConvexError('League not found');
    }

    return ctx.db.insert('sessions', {
      userId,
      leagueId: args.leagueId,
      weekNumber: args.weekNumber ?? null,
      date: args.date,
    });
  },
});

export const update = mutation({
  args: {
    sessionId: v.id('sessions'),
    weekNumber: v.optional(v.union(v.number(), v.null())),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const session = await ctx.db.get(args.sessionId);

    if (!session || session.userId !== userId) {
      throw new ConvexError('Session not found');
    }

    if (
      args.weekNumber !== undefined &&
      args.weekNumber !== null &&
      (!Number.isInteger(args.weekNumber) || args.weekNumber <= 0)
    ) {
      throw new ConvexError('Week number must be a positive whole number');
    }

    await ctx.db.patch(args.sessionId, {
      date: args.date,
      weekNumber: args.weekNumber ?? null,
    });

    return args.sessionId;
  },
});

export const remove = mutation({
  args: {
    sessionId: v.id('sessions'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const session = await ctx.db.get(args.sessionId);

    if (!session || session.userId !== userId) {
      throw new ConvexError('Session not found');
    }

    const games = await ctx.db
      .query('games')
      .withIndex('by_user_session', (q) =>
        q.eq('userId', userId).eq('sessionId', args.sessionId)
      )
      .collect();

    for (const game of games) {
      const frames = await ctx.db
        .query('frames')
        .withIndex('by_user_game', (q) =>
          q.eq('userId', userId).eq('gameId', game._id)
        )
        .collect();

      for (const frame of frames) {
        await ctx.db.delete(frame._id);
      }

      await ctx.db.delete(game._id);
    }

    await ctx.db.delete(args.sessionId);

    return args.sessionId;
  },
});
