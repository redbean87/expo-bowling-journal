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
    const patterns = await ctx.db
      .query('patterns')
      .withIndex('by_name')
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
      if (!game.patternId) {
        continue;
      }

      byId.set(String(game.patternId), {
        id: String(game.patternId),
        usedAt: game._creationTime,
      });
    }

    for (const session of sessions) {
      if (!session.patternId) {
        continue;
      }

      const key = String(session.patternId);
      const current = byId.get(key);

      if (!current || session._creationTime > current.usedAt) {
        byId.set(key, { id: key, usedAt: session._creationTime });
      }
    }

    const patternById = new Map(
      patterns.map((pattern) => [String(pattern._id), pattern])
    );

    return [...byId.values()]
      .sort((left, right) => right.usedAt - left.usedAt)
      .slice(0, 10)
      .map((entry) => patternById.get(entry.id))
      .filter((pattern) => Boolean(pattern));
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
