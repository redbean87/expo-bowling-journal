import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireUserId } from './lib/auth';

export const listByLeague = query({
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

    return sessions.sort((left, right) => {
      if (left.date !== right.date) {
        return right.date.localeCompare(left.date);
      }

      return right._creationTime - left._creationTime;
    });
  },
});

export const create = mutation({
  args: {
    leagueId: v.id('leagues'),
    weekNumber: v.optional(v.union(v.number(), v.null())),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const league = await ctx.db.get(args.leagueId);

    if (!league || league.userId !== userId) {
      throw new ConvexError('League not found');
    }

    return ctx.db.insert('sessions', {
      userId,
      leagueId: args.leagueId,
      weekNumber: args.weekNumber ?? null,
      date: args.date,
    });
  },
});
