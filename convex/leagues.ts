import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireUserId } from './lib/auth';
import { touchReferenceUsage } from './lib/reference_usage';

export const list = query({
  args: {
    cutoffDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const leagues = await ctx.db
      .query('leagues')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const leaguesWithSession = await Promise.all(
      leagues.map(async (league) => {
        const recentSession = await ctx.db
          .query('sessions')
          .withIndex('by_user_league', (q) =>
            q.eq('userId', userId).eq('leagueId', league._id)
          )
          .order('desc')
          .first();

        return {
          ...league,
          mostRecentSessionDate: recentSession?.date ?? null,
        };
      })
    );

    const filtered = leaguesWithSession.filter((league) => {
      if (!league.mostRecentSessionDate) return true;
      if (!args.cutoffDate) return true;
      return league.mostRecentSessionDate >= args.cutoffDate;
    });

    return filtered.sort((a, b) => {
      if (!a.mostRecentSessionDate && !b.mostRecentSessionDate) {
        return b.createdAt - a.createdAt;
      }
      if (!a.mostRecentSessionDate) return 1;
      if (!b.mostRecentSessionDate) return -1;
      return b.mostRecentSessionDate.localeCompare(a.mostRecentSessionDate);
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    clientSyncId: v.optional(v.union(v.string(), v.null())),
    gamesPerSession: v.optional(v.union(v.number(), v.null())),
    houseId: v.optional(v.union(v.id('houses'), v.null())),
    houseName: v.optional(v.union(v.string(), v.null())),
    startDate: v.optional(v.union(v.string(), v.null())),
    endDate: v.optional(v.union(v.string(), v.null())),
    type: v.optional(
      v.union(v.literal('league'), v.literal('tournament'), v.literal('open'))
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const normalizedClientSyncId =
      typeof args.clientSyncId === 'string'
        ? args.clientSyncId.trim() || null
        : null;

    let houseName = args.houseName ?? null;

    if (args.houseId) {
      const house = await ctx.db.get(args.houseId);

      if (!house) {
        throw new ConvexError('House not found');
      }

      houseName = house.name;
    }

    if (
      args.gamesPerSession !== undefined &&
      args.gamesPerSession !== null &&
      (!Number.isInteger(args.gamesPerSession) ||
        args.gamesPerSession < 1 ||
        args.gamesPerSession > 12)
    ) {
      throw new ConvexError(
        'Games per session must be a whole number between 1 and 12'
      );
    }

    const leagueId = await ctx.db.insert('leagues', {
      userId,
      name: args.name,
      clientSyncId: normalizedClientSyncId,
      gamesPerSession: args.gamesPerSession ?? null,
      houseId: args.houseId ?? null,
      houseName,
      startDate: args.startDate ?? null,
      endDate: args.endDate ?? null,
      createdAt: Date.now(),
      type: args.type ?? 'league',
    });

    if (args.houseId) {
      await touchReferenceUsage(ctx, {
        userId,
        referenceType: 'house',
        referenceId: String(args.houseId),
      });
    }

    return leagueId;
  },
});

export const update = mutation({
  args: {
    leagueId: v.id('leagues'),
    name: v.string(),
    gamesPerSession: v.optional(v.union(v.number(), v.null())),
    houseId: v.optional(v.union(v.id('houses'), v.null())),
    type: v.optional(v.union(v.literal('league'), v.literal('tournament'))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const league = await ctx.db.get(args.leagueId);

    if (!league || league.userId !== userId) {
      throw new ConvexError('League not found');
    }

    if (
      args.gamesPerSession !== undefined &&
      args.gamesPerSession !== null &&
      (!Number.isInteger(args.gamesPerSession) ||
        args.gamesPerSession < 1 ||
        args.gamesPerSession > 12)
    ) {
      throw new ConvexError(
        'Games per session must be a whole number between 1 and 12'
      );
    }

    let houseName: string | null = null;

    if (args.houseId) {
      const house = await ctx.db.get(args.houseId);

      if (!house) {
        throw new ConvexError('House not found');
      }

      houseName = house.name;
    }

    await ctx.db.patch(args.leagueId, {
      name: args.name,
      gamesPerSession: args.gamesPerSession ?? null,
      houseId: args.houseId ?? null,
      houseName,
      ...(args.type !== undefined ? { type: args.type } : {}),
    });

    if (args.houseId) {
      await touchReferenceUsage(ctx, {
        userId,
        referenceType: 'house',
        referenceId: String(args.houseId),
      });
    }

    return args.leagueId;
  },
});

export const remove = mutation({
  args: {
    leagueId: v.id('leagues'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const league = await ctx.db.get(args.leagueId);

    if (!league || league.userId !== userId) {
      throw new ConvexError('League not found');
    }

    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_user_league', (q) =>
        q.eq('userId', userId).eq('leagueId', args.leagueId)
      )
      .collect();

    for (const session of sessions) {
      const games = await ctx.db
        .query('games')
        .withIndex('by_user_session', (q) =>
          q.eq('userId', userId).eq('sessionId', session._id)
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

      await ctx.db.delete(session._id);
    }

    await ctx.db.delete(args.leagueId);

    return args.leagueId;
  },
});
