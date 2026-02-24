import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { requireUserId } from './lib/auth';
import {
  completeSnapshotImportForBatch,
  getRequiredImportBatch,
  persistCanonicalFramesForBatch,
} from './lib/import-callback-helpers';
import {
  getCallbackNonceByValue,
  getImportBatchById,
  getImportStatusForUser,
  insertCallbackNonce,
  updateImportBatchStatus,
} from './lib/import-callback-state';
import { applyRefinement } from './lib/import-core-refinement';
import {
  dispatchImportQueueActionRef,
  getBatchByIdForDispatchQueryRef,
  updateBatchStatusForDispatchMutationRef,
} from './lib/import-function-refs';
import { dispatchImportQueueToWorker } from './lib/import-queue-dispatch';
import { deleteUserDocsChunkForImportTable } from './lib/import-replace-all-cleanup';
import { runImportSqliteSnapshotAction } from './lib/import-snapshot-action';
import {
  importSqliteSnapshotAfterCleanupCore,
  submitParsedSnapshotForCallbackCore,
  submitParsedSnapshotJsonForCallbackCore,
} from './lib/import-snapshot-runner';
import {
  createSnapshotImportBatch,
  persistRawImportRowsForBatch,
} from './lib/import-snapshot-storage';
import { startImportBatch } from './lib/import-start';
import {
  DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE,
  type RawImportRow,
} from './lib/import-types';
import {
  batchIdArgs,
  createImportBatchForSnapshotArgs,
  dispatchImportQueueArgs,
  deleteUserDocsChunkForImportArgs,
  importSqliteSnapshotAfterCleanupArgs,
  insertNonceArgs,
  nonceLookupArgs,
  completeSnapshotImportArgs,
  persistCanonicalFrameChunkArgs,
  persistRawImportChunkArgs,
  postImportRefinementArgs,
  startImportArgs,
  submitParsedSnapshotArgs,
  submitParsedSnapshotJsonArgs,
  sqliteSnapshotArgs,
  updateBatchStatusArgs,
} from './lib/import-validators';
import { normalizeTimezoneOffsetMinutes } from './lib/import_dates';
import { normalizeNullableInteger } from './lib/import_refinement';

export const startImport = mutation({
  args: startImportArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const timezoneOffsetMinutes = normalizeTimezoneOffsetMinutes(
      args.timezoneOffsetMinutes
    );

    return startImportBatch(
      ctx,
      {
        userId,
        r2Key: args.r2Key,
        fileName: args.fileName,
        fileSize: args.fileSize,
        checksum: args.checksum,
        idempotencyKey: args.idempotencyKey,
        timezoneOffsetMinutes,
      },
      {
        scheduleDispatch: async (dispatchArgs) => {
          await ctx.scheduler.runAfter(
            0,
            dispatchImportQueueActionRef,
            dispatchArgs
          );
        },
      }
    );
  },
});

export const dispatchImportQueue = internalAction({
  args: dispatchImportQueueArgs,
  handler: async (ctx, args) => {
    await dispatchImportQueueToWorker(args, {
      getBatchById: async (batchId) => {
        return ctx.runQuery(getBatchByIdForDispatchQueryRef, { batchId });
      },
      markBatchFailed: async (batchId, errorMessage, completedAt) => {
        await ctx.runMutation(updateBatchStatusForDispatchMutationRef, {
          batchId,
          status: 'failed',
          completedAt,
          errorMessage,
        });
      },
    });
  },
});

export const getImportStatus = query({
  args: batchIdArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return getImportStatusForUser(ctx, { userId, batchId: args.batchId });
  },
});

export const getBatchByIdForCallback = internalQuery({
  args: batchIdArgs,
  handler: async (ctx, args) => {
    return getImportBatchById(ctx, args.batchId);
  },
});

export const updateBatchStatusForCallback = internalMutation({
  args: updateBatchStatusArgs,
  handler: async (ctx, args) => {
    return updateImportBatchStatus(ctx, args);
  },
});

export const getNonceByValueForCallback = internalQuery({
  args: nonceLookupArgs,
  handler: async (ctx, args) => {
    return getCallbackNonceByValue(ctx, args.nonce);
  },
});

export const insertNonceForCallback = internalMutation({
  args: insertNonceArgs,
  handler: async (ctx, args) => {
    return insertCallbackNonce(ctx, args);
  },
});

export const applyPostImportRefinement = mutation({
  args: postImportRefinementArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    return applyRefinement(ctx, userId, {
      sessions: args.sessions ?? [],
      games: args.games ?? [],
    });
  },
});

export const deleteUserDocsChunkForImport = internalMutation({
  args: deleteUserDocsChunkForImportArgs,
  handler: async (ctx, args) => {
    const chunkSize =
      normalizeNullableInteger(args.chunkSize, 1, 500) ??
      DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE;

    const deleted = await deleteUserDocsChunkForImportTable(
      ctx,
      args.userId,
      args.table,
      chunkSize
    );

    return { deleted };
  },
});

export const createImportBatchForSnapshot = internalMutation({
  args: createImportBatchForSnapshotArgs,
  handler: async (ctx, args) => {
    return createSnapshotImportBatch(ctx, args);
  },
});

export const persistRawImportChunkForBatch = internalMutation({
  args: persistRawImportChunkArgs,
  handler: async (ctx, args) => {
    return persistRawImportRowsForBatch(ctx, {
      batchId: args.batchId,
      table: args.table,
      rows: args.rows as RawImportRow[],
    });
  },
});

export const importSqliteSnapshotAfterCleanupForUser = internalMutation({
  args: importSqliteSnapshotAfterCleanupArgs,
  handler: async (ctx, args) => {
    return importSqliteSnapshotAfterCleanupCore(ctx, args);
  },
});

export const importSqliteSnapshot = action({
  args: sqliteSnapshotArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return runImportSqliteSnapshotAction(ctx, userId, args);
  },
});

export const submitParsedSnapshotForCallback = internalMutation({
  args: submitParsedSnapshotArgs,
  handler: async (ctx, args) => {
    return submitParsedSnapshotForCallbackCore(ctx, args);
  },
});

export const submitParsedSnapshotJsonForCallback = internalMutation({
  args: submitParsedSnapshotJsonArgs,
  handler: async (ctx, args) => {
    return submitParsedSnapshotJsonForCallbackCore(ctx, args);
  },
});

export const persistCanonicalFrameChunkForCallback = internalMutation({
  args: persistCanonicalFrameChunkArgs,
  handler: async (ctx, args) => {
    const batch = await getRequiredImportBatch(ctx, args.batchId);
    return persistCanonicalFramesForBatch(ctx, batch, args.frames);
  },
});

export const completeSnapshotImportForCallback = internalMutation({
  args: completeSnapshotImportArgs,
  handler: async (ctx, args) => {
    return completeSnapshotImportForBatch(ctx, args);
  },
});
