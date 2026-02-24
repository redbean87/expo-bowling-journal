import { REPLACE_ALL_CLEANUP_TABLES } from './import-types';

import type { ReplaceAllCleanupTable } from './import-types';
import type { Id, TableNames } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

async function deleteDocsById(
  ctx: MutationCtx,
  docs: Array<{ _id: Id<TableNames> }>
) {
  for (const doc of docs) {
    await ctx.db.delete(doc._id);
  }
}

async function takeUserDocsForCleanup(
  ctx: MutationCtx,
  userId: Id<'users'>,
  table: ReplaceAllCleanupTable,
  limit: number
) {
  switch (table) {
    case 'frames':
      return ctx.db
        .query('frames')
        .withIndex('by_user_game', (q) => q.eq('userId', userId))
        .take(limit);
    case 'games':
      return ctx.db
        .query('games')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit);
    case 'sessions':
      return ctx.db
        .query('sessions')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit);
    case 'leagues':
      return ctx.db
        .query('leagues')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit);
    case 'balls':
      return ctx.db
        .query('balls')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit);
    case 'importRawGames':
      return ctx.db
        .query('importRawGames')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit);
    case 'importRawFrames':
      return ctx.db
        .query('importRawFrames')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit);
    case 'importRawWeeks':
      return ctx.db
        .query('importRawWeeks')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit);
    case 'importRawLeagues':
      return ctx.db
        .query('importRawLeagues')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit);
    case 'importRawBalls':
      return ctx.db
        .query('importRawBalls')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit);
    case 'importRawPatterns':
      return ctx.db
        .query('importRawPatterns')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit);
    case 'importRawHouses':
      return ctx.db
        .query('importRawHouses')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(limit);
  }
}

export async function deleteUserDocsChunkForImportTable(
  ctx: MutationCtx,
  userId: Id<'users'>,
  table: ReplaceAllCleanupTable,
  chunkSize: number
) {
  const docs = await takeUserDocsForCleanup(ctx, userId, table, chunkSize);
  await deleteDocsById(ctx, docs as Array<{ _id: Id<TableNames> }>);
  return docs.length;
}

export async function clearUserImportDataInChunks(
  runChunkDelete: (table: ReplaceAllCleanupTable) => Promise<number>
) {
  for (const table of REPLACE_ALL_CLEANUP_TABLES) {
    let deleted = 0;

    do {
      deleted = await runChunkDelete(table);
    } while (deleted > 0);
  }
}
