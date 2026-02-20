import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireUserId } from './lib/auth';

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
    const balls = await ctx.db
      .query('balls')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const games = await ctx.db
      .query('games')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    const byId = new Map<string, { id: string; usedAt: number }>();

    for (const game of games) {
      if (!game.ballId) {
        continue;
      }

      byId.set(String(game.ballId), {
        id: String(game.ballId),
        usedAt: game._creationTime,
      });
    }

    for (const session of sessions) {
      if (!session.ballId) {
        continue;
      }

      const key = String(session.ballId);
      const current = byId.get(key);

      if (!current || session._creationTime > current.usedAt) {
        byId.set(key, { id: key, usedAt: session._creationTime });
      }
    }

    const ballById = new Map(balls.map((ball) => [String(ball._id), ball]));

    return [...byId.values()]
      .sort((left, right) => right.usedAt - left.usedAt)
      .slice(0, 10)
      .map((entry) => ballById.get(entry.id))
      .filter((ball) => Boolean(ball));
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
