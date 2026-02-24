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
    await requireUserId(ctx);

    const patterns = await ctx.db
      .query('patterns')
      .withIndex('by_name')
      .collect();
    return patterns.sort((left, right) => left.name.localeCompare(right.name));
  },
});

export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const recentIds = await listRecentReferenceIds(ctx, {
      userId,
      referenceType: 'pattern',
      limit: 10,
    });

    const patterns: Array<Doc<'patterns'>> = [];

    for (const id of recentIds) {
      const pattern = await ctx.db.get(id as Id<'patterns'>);

      if (pattern) {
        patterns.push(pattern);
      }
    }

    return patterns;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const normalized = normalizeName(args.name);

    if (normalized.length === 0) {
      throw new ConvexError('Pattern name is required');
    }

    const patterns = await ctx.db
      .query('patterns')
      .withIndex('by_name')
      .collect();
    const match = patterns.find(
      (pattern) => normalizeName(pattern.name) === normalized
    );

    if (match) {
      return match._id;
    }

    return await ctx.db.insert('patterns', {
      name: args.name.trim(),
      length: null,
    });
  },
});

export const touchUsage = mutation({
  args: {
    patternId: v.id('patterns'),
    usedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const pattern = await ctx.db.get(args.patternId);

    if (!pattern) {
      throw new ConvexError('Pattern not found');
    }

    await touchReferenceUsage(ctx, {
      userId,
      referenceType: 'pattern',
      referenceId: String(args.patternId),
      usedAt: args.usedAt,
    });

    return args.patternId;
  },
});
