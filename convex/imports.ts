import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';

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
  canonicalFrameInsertValidator,
  completeSnapshotImportArgs,
  postImportRefinementArgs,
  rawImportTableValidator,
  replaceAllCleanupTableValidator,
  sqliteSnapshotArgs,
} from './lib/import-validators';
import { normalizeTimezoneOffsetMinutes } from './lib/import_dates';
import { normalizeNullableInteger } from './lib/import_refinement';

import type { Id } from './_generated/dataModel';

const getBatchByIdForDispatchQuery = makeFunctionReference<
  'query',
  { batchId: Id<'importBatches'> },
  {
    _id: Id<'importBatches'>;
    userId: Id<'users'>;
    status: string;
    r2Key: string | null;
  } | null
>('imports:getBatchByIdForCallback');

const updateBatchStatusForDispatchMutation = makeFunctionReference<
  'mutation',
  {
    batchId: Id<'importBatches'>;
    status: 'parsing' | 'importing' | 'completed' | 'failed';
    completedAt?: number | null;
    errorMessage?: string | null;
  },
  Id<'importBatches'>
>('imports:updateBatchStatusForCallback');

const dispatchImportQueueActionReference = makeFunctionReference<
  'action',
  {
    batchId: Id<'importBatches'>;
    userId: Id<'users'>;
    r2Key: string;
    timezoneOffsetMinutes?: number | null;
  },
  void
>('imports:dispatchImportQueue');

export const startImport = mutation({
  args: {
    r2Key: v.string(),
    fileName: v.optional(v.union(v.string(), v.null())),
    fileSize: v.number(),
    checksum: v.optional(v.union(v.string(), v.null())),
    idempotencyKey: v.string(),
    timezoneOffsetMinutes: v.optional(v.union(v.number(), v.null())),
  },
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
            dispatchImportQueueActionReference,
            dispatchArgs
          );
        },
      }
    );
  },
});

export const dispatchImportQueue = internalAction({
  args: {
    batchId: v.id('importBatches'),
    userId: v.id('users'),
    r2Key: v.string(),
    timezoneOffsetMinutes: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    await dispatchImportQueueToWorker(args, {
      getBatchById: async (batchId) => {
        return ctx.runQuery(getBatchByIdForDispatchQuery, { batchId });
      },
      markBatchFailed: async (batchId, errorMessage, completedAt) => {
        await ctx.runMutation(updateBatchStatusForDispatchMutation, {
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
  args: {
    batchId: v.id('importBatches'),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return getImportStatusForUser(ctx, { userId, batchId: args.batchId });
  },
});

export const getBatchByIdForCallback = internalQuery({
  args: {
    batchId: v.id('importBatches'),
  },
  handler: async (ctx, args) => {
    return getImportBatchById(ctx, args.batchId);
  },
});

export const updateBatchStatusForCallback = internalMutation({
  args: {
    batchId: v.id('importBatches'),
    status: v.union(
      v.literal('parsing'),
      v.literal('importing'),
      v.literal('completed'),
      v.literal('failed')
    ),
    completedAt: v.optional(v.union(v.number(), v.null())),
    errorMessage: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    return updateImportBatchStatus(ctx, args);
  },
});

export const getNonceByValueForCallback = internalQuery({
  args: {
    nonce: v.string(),
  },
  handler: async (ctx, args) => {
    return getCallbackNonceByValue(ctx, args.nonce);
  },
});

export const insertNonceForCallback = internalMutation({
  args: {
    nonce: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  },
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
  args: {
    userId: v.id('users'),
    table: replaceAllCleanupTableValidator,
    chunkSize: v.optional(v.number()),
  },
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
  args: {
    userId: v.id('users'),
    sourceFileName: v.optional(v.union(v.string(), v.null())),
    sourceHash: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    return createSnapshotImportBatch(ctx, args);
  },
});

export const persistRawImportChunkForBatch = internalMutation({
  args: {
    batchId: v.id('importBatches'),
    table: rawImportTableValidator,
    rows: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    return persistRawImportRowsForBatch(ctx, {
      batchId: args.batchId,
      table: args.table,
      rows: args.rows as RawImportRow[],
    });
  },
});

export const importSqliteSnapshotAfterCleanupForUser = internalMutation({
  args: {
    userId: v.id('users'),
    batchId: v.optional(v.union(v.id('importBatches'), v.null())),
    skipRawMirrorPersistence: v.optional(v.boolean()),
    ...sqliteSnapshotArgs,
  },
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
  args: {
    batchId: v.id('importBatches'),
    parserVersion: v.optional(v.union(v.string(), v.null())),
    skipReplaceAllCleanup: v.optional(v.boolean()),
    skipRawMirrorPersistence: v.optional(v.boolean()),
    timezoneOffsetMinutes: v.optional(v.union(v.number(), v.null())),
    snapshot: v.object(sqliteSnapshotArgs),
  },
  handler: async (ctx, args) => {
    return submitParsedSnapshotForCallbackCore(ctx, args);
  },
});

export const submitParsedSnapshotJsonForCallback = internalMutation({
  args: {
    batchId: v.id('importBatches'),
    parserVersion: v.optional(v.union(v.string(), v.null())),
    skipReplaceAllCleanup: v.optional(v.boolean()),
    skipRawMirrorPersistence: v.optional(v.boolean()),
    timezoneOffsetMinutes: v.optional(v.union(v.number(), v.null())),
    snapshotJson: v.string(),
  },
  handler: async (ctx, args) => {
    return submitParsedSnapshotJsonForCallbackCore(ctx, args);
  },
});

export const persistCanonicalFrameChunkForCallback = internalMutation({
  args: {
    batchId: v.id('importBatches'),
    frames: v.array(canonicalFrameInsertValidator),
  },
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
