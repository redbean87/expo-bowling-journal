import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireUserId } from './lib/auth';

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
    const houses = await ctx.db.query('houses').withIndex('by_name').collect();
    const leagues = await ctx.db
      .query('leagues')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const byId = new Map<string, { id: string; usedAt: number }>();

    for (const session of sessions) {
      if (!session.houseId) {
        continue;
      }

      const key = String(session.houseId);
      const current = byId.get(key);

      if (!current || session._creationTime > current.usedAt) {
        byId.set(key, { id: key, usedAt: session._creationTime });
      }
    }

    for (const league of leagues) {
      if (!league.houseId) {
        continue;
      }

      const key = String(league.houseId);
      const current = byId.get(key);

      if (!current || league.createdAt > current.usedAt) {
        byId.set(key, { id: key, usedAt: league.createdAt });
      }
    }

    const houseById = new Map(
      houses.map((house) => [String(house._id), house])
    );

    return [...byId.values()]
      .sort((left, right) => right.usedAt - left.usedAt)
      .slice(0, 10)
      .map((entry) => houseById.get(entry.id))
      .filter((house) => Boolean(house));
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
      throw new ConvexError('House name is required');
    }

    const houses = await ctx.db.query('houses').withIndex('by_name').collect();
    const match = houses.find(
      (house) => normalizeName(house.name) === normalized
    );

    if (match) {
      return match._id;
    }

    return await ctx.db.insert('houses', {
      name: args.name.trim(),
      location: null,
    });
  },
});
