import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireUserId } from './lib/auth';
import { buildGameFramePreview } from './lib/game_frame_preview';
import { touchReferenceUsage } from './lib/reference_usage';

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

export const listByLeague = query({
  args: {
    leagueId: v.id('leagues'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const games = await ctx.db
      .query('games')
      .withIndex('by_user_league', (q) =>
        q.eq('userId', userId).eq('leagueId', args.leagueId)
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

// Lean query returning only the fields needed for session/season stat
// computations (average targets, night summaries, series progress bar).
// Omits framePreview, ballSwitches, laneContext, notes, and other fields
// that add ~500 bytes/game of dead weight to the live subscription payload.
export const listStatsByLeague = query({
  args: {
    leagueId: v.id('leagues'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const games = await ctx.db
      .query('games')
      .withIndex('by_user_league', (q) =>
        q.eq('userId', userId).eq('leagueId', args.leagueId)
      )
      .collect();

    return games.map((game) => ({
      _id: game._id,
      sessionId: game.sessionId,
      totalScore: game.totalScore,
      strikes: game.strikes,
      spares: game.spares,
      opens: game.opens,
    }));
  },
});

// Returns per-session aggregated stats for a league, ordered chronologically.
// Used by the Analytics tab for trend charts and personal records.
export const listSessionAggregates = query({
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

    const sorted = sessions.sort((a, b) => a.date.localeCompare(b.date));

    return Promise.all(
      sorted.map(async (session) => {
        const games = await ctx.db
          .query('games')
          .withIndex('by_user_session', (q) =>
            q.eq('userId', userId).eq('sessionId', session._id)
          )
          .collect();

        const scores = games
          .map((g) => g.totalScore)
          .filter((s) => typeof s === 'number' && s > 0) as number[];

        const totalStrikes = games.reduce((s, g) => s + (g.strikes ?? 0), 0);
        const totalSpares = games.reduce((s, g) => s + (g.spares ?? 0), 0);
        const totalOpens = games.reduce((s, g) => s + (g.opens ?? 0), 0);
        const cleanGames = games.filter(
          (g) =>
            (g.opens ?? 0) === 0 &&
            typeof g.totalScore === 'number' &&
            g.totalScore > 0
        ).length;

        return {
          sessionId: session._id,
          date: session.date,
          weekNumber: session.weekNumber ?? null,
          gameCount: scores.length,
          totalPins: scores.reduce((a, b) => a + b, 0),
          highGame: scores.length > 0 ? Math.max(...scores) : null,
          totalStrikes,
          totalSpares,
          totalOpens,
          cleanGames,
          gameScores: scores,
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

    if (normalizedClientSyncId) {
      const existing = await ctx.db
        .query('games')
        .withIndex('by_user_session', (q) =>
          q.eq('userId', userId).eq('sessionId', args.sessionId)
        )
        .filter((q) => q.eq(q.field('clientSyncId'), normalizedClientSyncId))
        .first();

      if (existing) {
        return existing._id;
      }
    }

    const gameId = await ctx.db.insert('games', {
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

    const usedAt = Date.now();

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

    return gameId;
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

    const usedAt = Date.now();

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

// Returns spare conversion rates grouped by pin mask (pins left standing after first roll).
// Only includes frames where roll1 < 10 (non-strike attempts).
// Groups by pin count (1-pin, 2-pin, 3+ pin leaves) and specific pin configurations.
export const listSpareConversionByPinMask = query({
  args: {
    leagueId: v.id('leagues'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const games = await ctx.db
      .query('games')
      .withIndex('by_user_league', (q) =>
        q.eq('userId', userId).eq('leagueId', args.leagueId)
      )
      .collect();

    const gameIds = games.map((g) => g._id);

    const allFrames: {
      roll1: number;
      roll2: number | null;
      pins: number | null;
    }[] = [];

    for (const gameId of gameIds) {
      const frames = await ctx.db
        .query('frames')
        .withIndex('by_user_game', (q) =>
          q.eq('userId', userId).eq('gameId', gameId)
        )
        .collect();

      for (const frame of frames) {
        if (frame.frameNumber <= 9) {
          allFrames.push({
            roll1: frame.roll1,
            roll2: frame.roll2 ?? null,
            pins: frame.pins ?? null,
          });
        }
      }
    }

    const spareAttempts = allFrames.filter((f) => f.roll1 < 10);

    const byPinCount: Map<number, { attempts: number; converted: number }> =
      new Map();

    const byPinMask: Map<
      number,
      { attempts: number; converted: number; pinCount: number }
    > = new Map();

    for (const frame of spareAttempts) {
      const pinsMask = frame.pins ?? 0;
      const pinCount = countPins(pinsMask);
      // Spare conversion: either (a) sum is >= 10 (picked up all standing pins),
      // or (b) roll2 is 0 but we cleared all pins (rare edge case for multi-pin leaves)
      const converted =
        frame.roll2 !== null &&
        (frame.roll1 + frame.roll2 >= 10 ||
          // Handle case where roll2 is 0 but we somehow cleared (shouldn't happen normally)
          (frame.roll2 === 0 && pinsMask === 0));

      const countStats = byPinCount.get(pinCount) ?? {
        attempts: 0,
        converted: 0,
      };
      countStats.attempts += 1;
      if (converted) countStats.converted += 1;
      byPinCount.set(pinCount, countStats);

      const maskStats = byPinMask.get(pinsMask) ?? {
        attempts: 0,
        converted: 0,
        pinCount,
      };
      maskStats.attempts += 1;
      if (converted) maskStats.converted += 1;
      byPinMask.set(pinsMask, maskStats);
    }

    const pinCountResults = Array.from(byPinCount.entries())
      .filter(([count]) => count >= 1 && count <= 9)
      .map(([pinCount, stats]) => ({
        pinCount,
        attempts: stats.attempts,
        converted: stats.converted,
        conversionRate:
          stats.attempts > 0 ? stats.converted / stats.attempts : 0,
      }))
      .sort((a, b) => b.pinCount - a.pinCount);

    const pinMaskResults = Array.from(byPinMask.entries())
      .filter(([, stats]) => stats.attempts >= 3)
      .map(([mask, stats]) => ({
        pinMask: mask,
        pinCount: stats.pinCount,
        attempts: stats.attempts,
        converted: stats.converted,
        conversionRate:
          stats.attempts > 0 ? stats.converted / stats.attempts : 0,
      }))
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 20);

    return {
      byPinCount: pinCountResults,
      byPinMask: pinMaskResults,
      totalSpareAttempts: spareAttempts.length,
      totalSparesConverted: spareAttempts.filter(
        (f) => f.roll2 !== null && f.roll1 + f.roll2 >= 10
      ).length,
    };
  },
});

function countPins(mask: number): number {
  let count = 0;
  let m = mask;
  while (m > 0) {
    count += m & 1;
    m >>= 1;
  }
  return count;
}
