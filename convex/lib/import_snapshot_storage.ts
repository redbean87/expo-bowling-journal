import { ConvexError } from 'convex/values';

import { insertRawImportRow } from './import_raw_mirror';
import { normalizeOptionalText } from './import_refinement';
import {
  EMPTY_IMPORT_COUNTS,
  type RawImportRow,
  type RawImportTable,
} from './import_types';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export async function createSnapshotImportBatch(
  ctx: MutationCtx,
  args: {
    userId: Id<'users'>;
    sourceFileName?: string | null;
    sourceHash?: string | null;
  }
) {
  const importedAt = Date.now();

  return ctx.db.insert('importBatches', {
    userId: args.userId,
    sourceType: 'sqlite',
    r2Key: null,
    sourceFileName: normalizeOptionalText(args.sourceFileName, 255),
    fileSize: null,
    sourceHash: normalizeOptionalText(args.sourceHash, 128),
    idempotencyKey: null,
    status: 'importing',
    errorMessage: null,
    importedAt,
    completedAt: null,
    counts: { ...EMPTY_IMPORT_COUNTS },
  });
}

export async function persistRawImportRowsForBatch(
  ctx: MutationCtx,
  args: {
    batchId: Id<'importBatches'>;
    table: RawImportTable;
    rows: RawImportRow[];
  }
) {
  const batch = await ctx.db.get(args.batchId);

  if (!batch) {
    throw new ConvexError('Import batch not found');
  }

  if (batch.status !== 'importing') {
    throw new ConvexError('Import batch must be importing to persist raw rows');
  }

  const importedAt = Date.now();

  for (const row of args.rows) {
    await insertRawImportRow(ctx, args.table, {
      userId: batch.userId,
      batchId: batch._id,
      row,
      importedAt,
    });
  }

  return {
    inserted: args.rows.length,
  };
}
