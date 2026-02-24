import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireUserId } from './lib/auth';
import {
  listRecentReferenceIds,
  touchReferenceUsage,
} from './lib/reference_usage';

import type { Doc, Id } from './_generated/dataModel';

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    const balls = await ctx.db
      .query('balls')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    return balls.sort((left, right) => left.name.localeCompare(right.name));
  },
});

export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const recentIds = await listRecentReferenceIds(ctx, {
      userId,
      referenceType: 'ball',
      limit: 10,
    });

    const balls: Array<Doc<'balls'>> = [];

    for (const id of recentIds) {
      const ball = await ctx.db.get(id as Id<'balls'>);

      if (ball && ball.userId === userId) {
        balls.push(ball);
      }
    }

    return balls;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const normalized = normalizeName(args.name);

    if (normalized.length === 0) {
      throw new ConvexError('Ball name is required');
    }

    const existing = await ctx.db
      .query('balls')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const match = existing.find(
      (ball) => normalizeName(ball.name) === normalized
    );

    if (match) {
      return match._id;
    }

    return await ctx.db.insert('balls', {
      userId,
      name: args.name.trim(),
      brand: null,
      coverstock: null,
    });
  },
});

export const touchUsage = mutation({
  args: {
    ballId: v.id('balls'),
    usedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ball = await ctx.db.get(args.ballId);

    if (!ball || ball.userId !== userId) {
      throw new ConvexError('Ball not found');
    }

    await touchReferenceUsage(ctx, {
      userId,
      referenceType: 'ball',
      referenceId: String(args.ballId),
      usedAt: args.usedAt,
    });

    return args.ballId;
  },
});
