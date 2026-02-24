import { ConvexError } from 'convex/values';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export type ImportBatchStatus =
  | 'queued'
  | 'parsing'
  | 'importing'
  | 'completed'
  | 'failed';

export async function getImportBatchById(
  ctx: QueryCtx,
  batchId: Id<'importBatches'>
) {
  return ctx.db.get(batchId);
}

export async function updateImportBatchStatus(
  ctx: MutationCtx,
  args: {
    batchId: Id<'importBatches'>;
    status: Exclude<ImportBatchStatus, 'queued'>;
    completedAt?: number | null;
    errorMessage?: string | null;
  }
) {
  await ctx.db.patch(args.batchId, {
    status: args.status,
    completedAt: args.completedAt ?? null,
    errorMessage: args.errorMessage ?? null,
  });

  return args.batchId;
}

export async function getImportStatusForUser(
  ctx: QueryCtx,
  args: {
    userId: Id<'users'>;
    batchId: Id<'importBatches'>;
  }
) {
  const batch = await ctx.db.get(args.batchId);

  if (!batch || batch.userId !== args.userId) {
    throw new ConvexError('Import batch not found');
  }

  return {
    batchId: batch._id,
    status: batch.status,
    sourceType: batch.sourceType,
    r2Key: batch.r2Key ?? null,
    sourceFileName: batch.sourceFileName ?? null,
    fileSize: batch.fileSize ?? null,
    sourceHash: batch.sourceHash ?? null,
    importedAt: batch.importedAt,
    completedAt: batch.completedAt ?? null,
    errorMessage: batch.errorMessage ?? null,
    counts: batch.counts,
  };
}

export async function getCallbackNonceByValue(ctx: QueryCtx, nonce: string) {
  return ctx.db
    .query('importCallbackNonces')
    .withIndex('by_nonce', (q) => q.eq('nonce', nonce))
    .first();
}

export async function insertCallbackNonce(
  ctx: MutationCtx,
  args: {
    nonce: string;
    createdAt: number;
    expiresAt: number;
  }
) {
  return ctx.db.insert('importCallbackNonces', {
    nonce: args.nonce,
    createdAt: args.createdAt,
    expiresAt: args.expiresAt,
  });
}
