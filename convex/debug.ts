// Temporary debug query for inspecting legacyFlags on existing leagues.
// Use from the Convex dashboard to identify which legacyFlags values correspond
// to tournaments vs regular leagues, enabling a targeted migration if a pattern exists.
// Safe to delete once the investigation is complete.

import { internalMutation, query } from './_generated/server';
import { requireUserId } from './lib/auth';

export const listLeagueFlagsSummary = query({
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const leagues = await ctx.db
      .query('leagues')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();

    return leagues.map((l) => ({
      name: l.name,
      legacyFlags: l.legacyFlags ?? null,
      type: l.type ?? null,
      isOpenBowling: l.isOpenBowling ?? null,
    }));
  },
});

// One-time migration: set type='tournament' for leagues where legacyFlags === 1,
// and type='league' for leagues where legacyFlags === 0, skipping any that already
// have an explicit type set. Safe to run multiple times (idempotent).
// Run from the Convex dashboard as an internal mutation (no auth required).
export const migrateLeagueTypesFromLegacyFlags = internalMutation({
  handler: async (ctx) => {
    const leagues = await ctx.db.query('leagues').collect();

    let patched = 0;
    let skipped = 0;

    for (const league of leagues) {
      if (league.type != null) {
        skipped++;
        continue;
      }

      if (league.isOpenBowling) {
        await ctx.db.patch(league._id, { type: 'open' });
        patched++;
        continue;
      }

      if (league.legacyFlags === 1) {
        await ctx.db.patch(league._id, { type: 'tournament' });
        patched++;
        continue;
      }

      if (league.legacyFlags === 0) {
        await ctx.db.patch(league._id, { type: 'league' });
        patched++;
        continue;
      }

      skipped++;
    }

    return { patched, skipped };
  },
});
