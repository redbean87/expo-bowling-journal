import { ConvexError, v } from 'convex/values';

import { mutation } from './_generated/server';
import { requireUserId } from './lib/auth';
import {
  touchReferenceUsage,
  type ReferenceUsageType,
} from './lib/reference_usage';

type BackfillSource = 'games' | 'sessions' | 'leagues';

function normalizePageSize(value: number | undefined) {
  if (!value || !Number.isInteger(value) || value <= 0) {
    return 200;
  }

  return Math.min(value, 500);
}

export const backfillReferenceUsage = mutation({
  args: {
    source: v.union(
      v.literal('games'),
      v.literal('sessions'),
      v.literal('leagues')
    ),
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const pageSize = normalizePageSize(args.pageSize);
    const dryRun = args.dryRun ?? false;
    const usageByKey = new Map<
      string,
      { referenceType: ReferenceUsageType; referenceId: string; usedAt: number }
    >();

    const trackUsage = (
      referenceType: ReferenceUsageType,
      referenceId: string | null,
      usedAt: number
    ) => {
      if (!referenceId) {
        return;
      }

      const key = `${referenceType}:${referenceId}`;
      const existing = usageByKey.get(key);

      if (!existing || usedAt > existing.usedAt) {
        usageByKey.set(key, {
          referenceType,
          referenceId,
          usedAt,
        });
      }
    };

    let scanned = 0;
    let continueCursor: string | null = null;
    let hasMore = false;

    const source = args.source as BackfillSource;

    if (source === 'games') {
      const page = await ctx.db
        .query('games')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .paginate({
          numItems: pageSize,
          cursor: args.cursor ?? null,
        });

      scanned = page.page.length;
      continueCursor = page.continueCursor;
      hasMore = !page.isDone;

      for (const game of page.page) {
        trackUsage(
          'ball',
          game.ballId ? String(game.ballId) : null,
          game._creationTime
        );
        trackUsage(
          'pattern',
          game.patternId ? String(game.patternId) : null,
          game._creationTime
        );
      }
    }

    if (source === 'sessions') {
      const page = await ctx.db
        .query('sessions')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .paginate({
          numItems: pageSize,
          cursor: args.cursor ?? null,
        });

      scanned = page.page.length;
      continueCursor = page.continueCursor;
      hasMore = !page.isDone;

      for (const session of page.page) {
        trackUsage(
          'house',
          session.houseId ? String(session.houseId) : null,
          session._creationTime
        );
        trackUsage(
          'ball',
          session.ballId ? String(session.ballId) : null,
          session._creationTime
        );
        trackUsage(
          'pattern',
          session.patternId ? String(session.patternId) : null,
          session._creationTime
        );
      }
    }

    if (source === 'leagues') {
      const page = await ctx.db
        .query('leagues')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .paginate({
          numItems: pageSize,
          cursor: args.cursor ?? null,
        });

      scanned = page.page.length;
      continueCursor = page.continueCursor;
      hasMore = !page.isDone;

      for (const league of page.page) {
        trackUsage(
          'house',
          league.houseId ? String(league.houseId) : null,
          league.createdAt
        );
      }
    }

    if (scanned === 0 && !dryRun && args.cursor && !hasMore) {
      throw new ConvexError('No rows scanned for backfill source/cursor');
    }

    let touched = 0;

    if (!dryRun) {
      for (const value of usageByKey.values()) {
        await touchReferenceUsage(ctx, {
          userId,
          referenceType: value.referenceType,
          referenceId: value.referenceId,
          usedAt: value.usedAt,
        });
        touched += 1;
      }
    }

    return {
      source,
      scanned,
      candidates: usageByKey.size,
      touched,
      dryRun,
      hasMore,
      continueCursor,
    };
  },
});
