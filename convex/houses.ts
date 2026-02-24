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

    const houses = await ctx.db.query('houses').withIndex('by_name').collect();
    return houses.sort((left, right) => left.name.localeCompare(right.name));
  },
});

export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const recentIds = await listRecentReferenceIds(ctx, {
      userId,
      referenceType: 'house',
      limit: 10,
    });

    const houses: Array<Doc<'houses'>> = [];

    for (const id of recentIds) {
      const house = await ctx.db.get(id as Id<'houses'>);

      if (house) {
        houses.push(house);
      }
    }

    return houses;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const normalized = normalizeName(args.name);
    const trimmedName = args.name.trim();

    if (normalized.length === 0) {
      throw new ConvexError('House name is required');
    }

    const existingByNorm = await ctx.db
      .query('houses')
      .withIndex('by_name_norm', (q) => q.eq('nameNorm', normalized))
      .first();

    if (existingByNorm) {
      return existingByNorm._id;
    }

    const existingByExact = await ctx.db
      .query('houses')
      .withIndex('by_name', (q) => q.eq('name', trimmedName))
      .first();

    if (existingByExact) {
      return existingByExact._id;
    }

    return await ctx.db.insert('houses', {
      name: trimmedName,
      nameNorm: normalized,
      location: null,
    });
  },
});

export const touchUsage = mutation({
  args: {
    houseId: v.id('houses'),
    usedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const house = await ctx.db.get(args.houseId);

    if (!house) {
      throw new ConvexError('House not found');
    }

    await touchReferenceUsage(ctx, {
      userId,
      referenceType: 'house',
      referenceId: String(args.houseId),
      usedAt: args.usedAt,
    });

    return args.houseId;
  },
});
