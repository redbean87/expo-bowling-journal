import { makeFunctionReference } from 'convex/server';
import { ConvexError, v } from 'convex/values';

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
  completeImportBatch,
  toPublicImportResult,
} from './lib/import-batch-lifecycle';
import { applyRefinement } from './lib/import-core-refinement';
import { runSqliteSnapshotImportCore } from './lib/import-core-runner';
import { dispatchImportQueueToWorker } from './lib/import-queue-dispatch';
import { insertRawImportRow } from './lib/import-raw-mirror';
import { deleteUserDocsChunkForImportTable } from './lib/import-replace-all-cleanup';
import { runImportSqliteSnapshotAction } from './lib/import-snapshot-action';
import {
  DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE,
  EMPTY_IMPORT_COUNTS,
  type RawImportRow,
  type SqliteSnapshotInput,
} from './lib/import-types';
import {
  ballSwitchValidator,
  canonicalFrameInsertValidator,
  laneContextValidator,
  rawImportTableValidator,
  replaceAllCleanupTableValidator,
  sqliteSnapshotArgs,
} from './lib/import-validators';
import { normalizeTimezoneOffsetMinutes } from './lib/import_dates';
import {
  normalizeNullableInteger,
  normalizeOptionalText,
} from './lib/import_refinement';
import { parseSnapshotJsonPayload } from './lib/import_snapshot';

import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

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

function validateR2KeyOwnership(userId: Id<'users'>, r2Key: string) {
  const expectedPrefix = `imports/${String(userId)}/`;

  if (!r2Key.startsWith(expectedPrefix)) {
    throw new ConvexError('r2Key must be scoped to the authenticated user');
  }
}

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

    if (!Number.isFinite(args.fileSize) || args.fileSize <= 0) {
      throw new ConvexError('fileSize must be a positive number');
    }

    const idempotencyKey = args.idempotencyKey.trim();

    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new ConvexError('idempotencyKey must be 8-128 characters');
    }

    validateR2KeyOwnership(userId, args.r2Key);
    const timezoneOffsetMinutes = normalizeTimezoneOffsetMinutes(
      args.timezoneOffsetMinutes
    );

    const existingBatch = await ctx.db
      .query('importBatches')
      .withIndex('by_user_idempotency', (q) =>
        q.eq('userId', userId).eq('idempotencyKey', idempotencyKey)
      )
      .first();

    if (existingBatch) {
      return {
        batchId: existingBatch._id,
        deduplicated: true,
      };
    }

    const batchId = await ctx.db.insert('importBatches', {
      userId,
      sourceType: 'sqlite',
      r2Key: args.r2Key,
      sourceFileName: normalizeOptionalText(args.fileName, 255),
      fileSize: Math.trunc(args.fileSize),
      sourceHash: normalizeOptionalText(args.checksum, 128),
      idempotencyKey,
      status: 'queued',
      errorMessage: null,
      importedAt: Date.now(),
      completedAt: null,
      counts: { ...EMPTY_IMPORT_COUNTS },
    });

    await ctx.scheduler.runAfter(0, dispatchImportQueueActionReference, {
      batchId,
      userId,
      r2Key: args.r2Key,
      timezoneOffsetMinutes,
    });

    return {
      batchId,
      deduplicated: false,
    };
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
    const batch = await ctx.db.get(args.batchId);

    if (!batch || batch.userId !== userId) {
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
  },
});

export const getBatchByIdForCallback = internalQuery({
  args: {
    batchId: v.id('importBatches'),
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.batchId);
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
    await ctx.db.patch(args.batchId, {
      status: args.status,
      completedAt: args.completedAt ?? null,
      errorMessage: args.errorMessage ?? null,
    });

    return args.batchId;
  },
});

export const getNonceByValueForCallback = internalQuery({
  args: {
    nonce: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query('importCallbackNonces')
      .withIndex('by_nonce', (q) => q.eq('nonce', args.nonce))
      .first();
  },
});

export const insertNonceForCallback = internalMutation({
  args: {
    nonce: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert('importCallbackNonces', {
      nonce: args.nonce,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });
  },
});

export const applyPostImportRefinement = mutation({
  args: {
    sessions: v.optional(
      v.array(
        v.object({
          sessionId: v.id('sessions'),
          laneContext: v.optional(v.union(laneContextValidator, v.null())),
          notes: v.optional(v.union(v.string(), v.null())),
        })
      )
    ),
    games: v.optional(
      v.array(
        v.object({
          gameId: v.id('games'),
          handicap: v.optional(v.union(v.number(), v.null())),
          laneContext: v.optional(v.union(laneContextValidator, v.null())),
          ballSwitches: v.optional(
            v.union(v.array(ballSwitchValidator), v.null())
          ),
          notes: v.optional(v.union(v.string(), v.null())),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    return applyRefinement(ctx, userId, {
      sessions: args.sessions ?? [],
      games: args.games ?? [],
    });
  },
});

async function runSqliteSnapshotImport(
  ctx: MutationCtx,
  userId: Id<'users'>,
  args: SqliteSnapshotInput,
  existingBatchId?: Id<'importBatches'>,
  options?: {
    skipReplaceAllCleanup?: boolean;
    skipRawMirrorPersistence?: boolean;
  }
) {
  const result = await runSqliteSnapshotImportCore(
    ctx,
    userId,
    args,
    existingBatchId,
    options,
    { applyRefinement }
  );

  await completeImportBatch(ctx, {
    batchId: result.batchId,
    counts: result.counts,
    refinement: result.refinement,
    warnings: result.warnings,
  });

  return toPublicImportResult(result);
}

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
  },
});

export const persistRawImportChunkForBatch = internalMutation({
  args: {
    batchId: v.id('importBatches'),
    table: rawImportTableValidator,
    rows: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);

    if (!batch) {
      throw new ConvexError('Import batch not found');
    }

    if (batch.status !== 'importing') {
      throw new ConvexError(
        'Import batch must be importing to persist raw rows'
      );
    }

    const importedAt = Date.now();

    for (const row of args.rows as RawImportRow[]) {
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
    const { userId, batchId, skipRawMirrorPersistence, ...snapshotArgs } = args;
    return runSqliteSnapshotImport(
      ctx,
      userId,
      snapshotArgs,
      batchId ?? undefined,
      {
        skipReplaceAllCleanup: true,
        skipRawMirrorPersistence: skipRawMirrorPersistence ?? false,
      }
    );
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
    const batch = await ctx.db.get(args.batchId);

    if (!batch) {
      throw new ConvexError('Import batch not found');
    }

    return runSqliteSnapshotImportCore(
      ctx,
      batch.userId,
      args.snapshot,
      batch._id,
      {
        skipReplaceAllCleanup: args.skipReplaceAllCleanup ?? false,
        skipRawMirrorPersistence: args.skipRawMirrorPersistence ?? false,
        timezoneOffsetMinutes: args.timezoneOffsetMinutes ?? null,
      },
      { applyRefinement }
    );
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
    const batch = await ctx.db.get(args.batchId);

    if (!batch) {
      throw new ConvexError('Import batch not found');
    }

    const snapshot = parseSnapshotJsonPayload<SqliteSnapshotInput>(
      args.snapshotJson
    );
    return runSqliteSnapshotImportCore(
      ctx,
      batch.userId,
      snapshot,
      batch._id,
      {
        skipReplaceAllCleanup: args.skipReplaceAllCleanup ?? false,
        skipRawMirrorPersistence: args.skipRawMirrorPersistence ?? false,
        timezoneOffsetMinutes: args.timezoneOffsetMinutes ?? null,
      },
      { applyRefinement }
    );
  },
});

export const persistCanonicalFrameChunkForCallback = internalMutation({
  args: {
    batchId: v.id('importBatches'),
    frames: v.array(canonicalFrameInsertValidator),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);

    if (!batch) {
      throw new ConvexError('Import batch not found');
    }

    if (batch.status !== 'importing') {
      throw new ConvexError('Import batch must be importing to persist frames');
    }

    for (const frame of args.frames) {
      await ctx.db.insert('frames', {
        userId: batch.userId,
        gameId: frame.gameId,
        frameNumber: frame.frameNumber,
        roll1: frame.roll1,
        roll2: frame.roll2,
        roll3: frame.roll3,
        ballId: frame.ballId,
        pins: frame.pins,
        scores: frame.scores,
        score: frame.score,
        flags: frame.flags,
        pocket: frame.pocket,
        footBoard: frame.footBoard,
        targetBoard: frame.targetBoard,
      });
    }

    return {
      inserted: args.frames.length,
    };
  },
});

export const completeSnapshotImportForCallback = internalMutation({
  args: {
    batchId: v.id('importBatches'),
    counts: v.object({
      houses: v.number(),
      leagues: v.number(),
      weeks: v.number(),
      sessions: v.number(),
      balls: v.number(),
      games: v.number(),
      frames: v.number(),
      patterns: v.number(),
    }),
    refinement: v.object({
      sessionsProcessed: v.number(),
      sessionsPatched: v.number(),
      sessionsSkipped: v.number(),
      gamesProcessed: v.number(),
      gamesPatched: v.number(),
      gamesSkipped: v.number(),
      warnings: v.array(
        v.object({
          recordType: v.union(v.literal('session'), v.literal('game')),
          recordId: v.string(),
          message: v.string(),
        })
      ),
    }),
    warnings: v.array(
      v.object({
        recordType: v.union(v.literal('session'), v.literal('game')),
        recordId: v.string(),
        message: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);

    if (!batch) {
      throw new ConvexError('Import batch not found');
    }

    await completeImportBatch(ctx, {
      batchId: args.batchId,
      counts: args.counts,
      refinement: args.refinement,
      warnings: args.warnings,
    });

    return args.batchId;
  },
});
