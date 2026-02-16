import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireUserId } from './lib/auth';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    const leagues = await ctx.db
      .query('leagues')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    return leagues.sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return right.createdAt - left.createdAt;
      }

      if (left._creationTime !== right._creationTime) {
        return right._creationTime - left._creationTime;
      }

      return left.name.localeCompare(right.name);
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    houseId: v.optional(v.union(v.id('houses'), v.null())),
    houseName: v.optional(v.union(v.string(), v.null())),
    startDate: v.optional(v.union(v.string(), v.null())),
    endDate: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    return ctx.db.insert('leagues', {
      userId,
      name: args.name,
      houseId: args.houseId ?? null,
      houseName: args.houseName ?? null,
      startDate: args.startDate ?? null,
      endDate: args.endDate ?? null,
      createdAt: Date.now(),
    });
  },
});
