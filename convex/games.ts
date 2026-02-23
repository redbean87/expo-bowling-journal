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

    return sortedGames;
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
    clientSyncId: v.optional(v.union(v.string(), v.null())),
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

    const normalizedClientSyncId =
      typeof args.clientSyncId === 'string'
        ? args.clientSyncId.trim() || null
        : null;

    return ctx.db.insert('games', {
      userId,
      sessionId: args.sessionId,
      leagueId: session.leagueId,
      clientSyncId: normalizedClientSyncId,
      date: args.date,
      totalScore: 0,
      strikes: 0,
      spares: 0,
      opens: 0,
      ballId: args.ballId ?? null,
      patternId: args.patternId ?? null,
      framePreview: buildGameFramePreview([]),
    });
  },
});

export const backfillMissingFramePreview = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const pageSize =
      args.pageSize && Number.isInteger(args.pageSize) && args.pageSize > 0
        ? Math.min(args.pageSize, 200)
        : 100;

    const page = await ctx.db
      .query('games')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .paginate({
        numItems: pageSize,
        cursor: args.cursor ?? null,
      });

    let patched = 0;
    let skipped = 0;

    for (const game of page.page) {
      if (Array.isArray(game.framePreview) && game.framePreview.length > 0) {
        skipped += 1;
        continue;
      }

      const frames = await ctx.db
        .query('frames')
        .withIndex('by_user_game', (q) =>
          q.eq('userId', userId).eq('gameId', game._id)
        )
        .collect();
      const sortedFrames = frames.sort(
        (left, right) => left.frameNumber - right.frameNumber
      );

      await ctx.db.patch(game._id, {
        framePreview: buildGameFramePreview(sortedFrames),
      });
      patched += 1;
    }

    return {
      scanned: page.page.length,
      patched,
      skipped,
      hasMore: !page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const migrateRemoveLegacyHouseId = mutation({
  args: {
    confirm: v.literal('remove-legacy-game-house-id'),
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const pageSize =
      args.pageSize && Number.isInteger(args.pageSize) && args.pageSize > 0
        ? Math.min(args.pageSize, 200)
        : 100;
    const dryRun = args.dryRun ?? false;

    const page = await ctx.db.query('games').paginate({
      numItems: pageSize,
      cursor: args.cursor ?? null,
    });

    let cleaned = 0;
    let skipped = 0;

    for (const game of page.page) {
      const rawGame = game as Record<string, unknown>;
      const hasLegacyHouseId = Object.prototype.hasOwnProperty.call(
        rawGame,
        'houseId'
      );

      if (!hasLegacyHouseId) {
        skipped += 1;
        continue;
      }

      if (dryRun) {
        cleaned += 1;
        continue;
      }

      await ctx.db.replace(game._id, {
        userId: game.userId,
        sessionId: game.sessionId,
        leagueId: game.leagueId,
        clientSyncId: game.clientSyncId ?? null,
        date: game.date,
        totalScore: game.totalScore,
        strikes: game.strikes,
        spares: game.spares,
        opens: game.opens,
        ballId: game.ballId ?? null,
        patternId: game.patternId ?? null,
        handicap: game.handicap ?? null,
        notes: game.notes ?? null,
        laneContext: game.laneContext ?? null,
        ballSwitches: game.ballSwitches ?? null,
        framePreview: game.framePreview ?? null,
      });
      cleaned += 1;
    }

    return {
      scanned: page.page.length,
      cleaned,
      skipped,
      hasMore: !page.isDone,
      continueCursor: page.continueCursor,
      dryRun,
      confirmed: args.confirm,
    };
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

export const remove = mutation({
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

    for (const frame of frames) {
      await ctx.db.delete(frame._id);
    }

    await ctx.db.delete(args.gameId);

    return args.gameId;
  },
});
