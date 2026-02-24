import { ConvexError } from 'convex/values';

import type { RawImportRow, RawImportTable } from './import-types';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export function chunkRows<T>(rows: T[], chunkSize: number) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new ConvexError('chunkSize must be a positive integer');
  }

  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function insertRawImportRow(
  ctx: MutationCtx,
  table: RawImportTable,
  args: {
    userId: Id<'users'>;
    batchId: Id<'importBatches'>;
    row: RawImportRow;
    importedAt: number;
  }
) {
  const sqliteId = args.row.sqliteId;

  if (typeof sqliteId !== 'number' || !Number.isFinite(sqliteId)) {
    throw new ConvexError(`Raw row for ${table} is missing numeric sqliteId`);
  }

  await ctx.db.insert(table, {
    userId: args.userId,
    batchId: args.batchId,
    sqliteId,
    raw: args.row,
    importedAt: args.importedAt,
  });
}
