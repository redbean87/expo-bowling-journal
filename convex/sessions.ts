import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireUserId } from './lib/auth';
import { touchReferenceUsage } from './lib/reference_usage';

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
    clientSyncId: v.optional(v.union(v.string(), v.null())),
    weekNumber: v.optional(v.union(v.number(), v.null())),
    date: v.string(),
    houseId: v.optional(v.union(v.id('houses'), v.null())),
    ballId: v.optional(v.union(v.id('balls'), v.null())),
    patternId: v.optional(v.union(v.id('patterns'), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const normalizedClientSyncId =
      typeof args.clientSyncId === 'string'
        ? args.clientSyncId.trim() || null
        : null;
    const league = await ctx.db.get(args.leagueId);

    if (!league || league.userId !== userId) {
      throw new ConvexError('League not found');
    }

    const resolvedHouseId =
      args.houseId === undefined ? (league.houseId ?? null) : args.houseId;

    if (resolvedHouseId) {
      const house = await ctx.db.get(resolvedHouseId);

      if (!house) {
        throw new ConvexError('House not found');
      }
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

    const sessionId = await ctx.db.insert('sessions', {
      userId,
      leagueId: args.leagueId,
      clientSyncId: normalizedClientSyncId,
      weekNumber: args.weekNumber ?? null,
      date: args.date,
      houseId: resolvedHouseId,
      ballId: args.ballId ?? null,
      patternId: args.patternId ?? null,
    });

    const usedAt = Date.now();

    if (resolvedHouseId) {
      await touchReferenceUsage(ctx, {
        userId,
        referenceType: 'house',
        referenceId: String(resolvedHouseId),
        usedAt,
      });
    }

    if (args.ballId) {
      await touchReferenceUsage(ctx, {
        userId,
        referenceType: 'ball',
        referenceId: String(args.ballId),
        usedAt,
      });
    }

    if (args.patternId) {
      await touchReferenceUsage(ctx, {
        userId,
        referenceType: 'pattern',
        referenceId: String(args.patternId),
        usedAt,
      });
    }

    return sessionId;
  },
});

export const update = mutation({
  args: {
    sessionId: v.id('sessions'),
    weekNumber: v.optional(v.union(v.number(), v.null())),
    date: v.string(),
    houseId: v.optional(v.union(v.id('houses'), v.null())),
    ballId: v.optional(v.union(v.id('balls'), v.null())),
    patternId: v.optional(v.union(v.id('patterns'), v.null())),
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

    if (args.houseId) {
      const house = await ctx.db.get(args.houseId);

      if (!house) {
        throw new ConvexError('House not found');
      }
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

    await ctx.db.patch(args.sessionId, {
      date: args.date,
      weekNumber: args.weekNumber ?? null,
      houseId: args.houseId ?? null,
      ballId: args.ballId ?? null,
      patternId: args.patternId ?? null,
    });

    const usedAt = Date.now();

    if (args.houseId) {
      await touchReferenceUsage(ctx, {
        userId,
        referenceType: 'house',
        referenceId: String(args.houseId),
        usedAt,
      });
    }

    if (args.ballId) {
      await touchReferenceUsage(ctx, {
        userId,
        referenceType: 'ball',
        referenceId: String(args.ballId),
        usedAt,
      });
    }

    if (args.patternId) {
      await touchReferenceUsage(ctx, {
        userId,
        referenceType: 'pattern',
        referenceId: String(args.patternId),
        usedAt,
      });
    }

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
