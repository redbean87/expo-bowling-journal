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
import { runSqliteSnapshotImportCore } from './lib/import-core-runner';
import {
  clearUserImportDataInChunks,
  deleteUserDocsChunkForImportTable,
} from './lib/import-replace-all-cleanup';
import {
  DEFAULT_RAW_IMPORT_CHUNK_SIZE,
  DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE,
  EMPTY_IMPORT_COUNTS,
  type GameRefinementInput,
  type ImportResult,
  type RawImportRow,
  type RawImportTable,
  type RefinementResult,
  type RefinementWarning,
  type ReplaceAllCleanupTable,
  type SessionRefinementInput,
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
import { hmacSha256Hex, sha256Hex } from './lib/import_callback_hmac';
import { normalizeTimezoneOffsetMinutes } from './lib/import_dates';
import {
  normalizeBallSwitches,
  normalizeLaneContext,
  normalizeNullableInteger,
  normalizeOptionalText,
} from './lib/import_refinement';
import { parseSnapshotJsonPayload } from './lib/import_snapshot';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import type { BallSwitchInput } from './lib/import_refinement';

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

function hasOwn(object: object, property: string) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function validateR2KeyOwnership(userId: Id<'users'>, r2Key: string) {
  const expectedPrefix = `imports/${String(userId)}/`;

  if (!r2Key.startsWith(expectedPrefix)) {
    throw new ConvexError('r2Key must be scoped to the authenticated user');
  }
}

function chunkRows<T>(rows: T[], chunkSize: number) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new ConvexError('chunkSize must be a positive integer');
  }

  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }

  return chunks;
}

async function insertRawImportRow(
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

async function resolveBallName(
  ctx: MutationCtx,
  userId: Id<'users'>,
  ballId: Id<'balls'>
) {
  const ball = await ctx.db.get(ballId);

  if (!ball || ball.userId !== userId) {
    return null;
  }

  return ball.name;
}

async function applyRefinement(
  ctx: MutationCtx,
  userId: Id<'users'>,
  args: {
    sessions: SessionRefinementInput[];
    games: GameRefinementInput[];
  }
): Promise<RefinementResult> {
  const warnings: RefinementWarning[] = [];
  let sessionsPatched = 0;
  let sessionsSkipped = 0;
  let gamesPatched = 0;
  let gamesSkipped = 0;

  for (const sessionInput of args.sessions) {
    const session = await ctx.db.get(sessionInput.sessionId);

    if (!session || session.userId !== userId) {
      sessionsSkipped += 1;
      warnings.push({
        recordType: 'session',
        recordId: String(sessionInput.sessionId),
        message: 'Session not found or not owned by current user',
      });
      continue;
    }

    const patch: Partial<Doc<'sessions'>> = {};
    const localWarnings: string[] = [];

    if (hasOwn(sessionInput, 'notes')) {
      patch.notes = normalizeOptionalText(sessionInput.notes);
    }

    if (hasOwn(sessionInput, 'laneContext')) {
      patch.laneContext =
        normalizeLaneContext(
          sessionInput.laneContext,
          localWarnings,
          `session ${sessionInput.sessionId}`
        ) ?? null;
    }

    for (const warning of localWarnings) {
      warnings.push({
        recordType: 'session',
        recordId: String(sessionInput.sessionId),
        message: warning,
      });
    }

    if (Object.keys(patch).length === 0) {
      sessionsSkipped += 1;
      continue;
    }

    await ctx.db.patch(sessionInput.sessionId, patch);
    sessionsPatched += 1;
  }

  for (const gameInput of args.games) {
    const game = await ctx.db.get(gameInput.gameId);

    if (!game || game.userId !== userId) {
      gamesSkipped += 1;
      warnings.push({
        recordType: 'game',
        recordId: String(gameInput.gameId),
        message: 'Game not found or not owned by current user',
      });
      continue;
    }

    const patch: Partial<Doc<'games'>> = {};
    const localWarnings: string[] = [];

    if (hasOwn(gameInput, 'handicap')) {
      const normalizedHandicap = normalizeNullableInteger(
        gameInput.handicap,
        -200,
        200
      );

      if (gameInput.handicap !== undefined && normalizedHandicap === null) {
        localWarnings.push('handicap must be an integer between -200 and 200');
      }

      patch.handicap = normalizedHandicap;
    }

    if (hasOwn(gameInput, 'notes')) {
      patch.notes = normalizeOptionalText(gameInput.notes);
    }

    if (hasOwn(gameInput, 'laneContext')) {
      patch.laneContext =
        normalizeLaneContext(
          gameInput.laneContext,
          localWarnings,
          `game ${gameInput.gameId}`
        ) ?? null;
    }

    if (hasOwn(gameInput, 'ballSwitches')) {
      const normalizedSwitches = normalizeBallSwitches(
        gameInput.ballSwitches,
        localWarnings,
        `game ${gameInput.gameId}`
      );

      if (normalizedSwitches === null) {
        patch.ballSwitches = null;
      } else {
        const verifiedSwitches: BallSwitchInput[] = [];

        for (const ballSwitch of normalizedSwitches) {
          if (!ballSwitch.ballId) {
            verifiedSwitches.push(ballSwitch);
            continue;
          }

          const ballName = await resolveBallName(
            ctx,
            userId,
            ballSwitch.ballId
          );

          if (!ballName) {
            localWarnings.push(
              `game ${gameInput.gameId}: ball ${ballSwitch.ballId} is missing or unauthorized`
            );
            verifiedSwitches.push({
              ...ballSwitch,
              ballId: null,
              ballName: ballSwitch.ballName ?? null,
            });
            continue;
          }

          verifiedSwitches.push({
            ...ballSwitch,
            ballName: ballSwitch.ballName ?? ballName,
          });
        }

        patch.ballSwitches = verifiedSwitches;
      }
    }

    for (const warning of localWarnings) {
      warnings.push({
        recordType: 'game',
        recordId: String(gameInput.gameId),
        message: warning,
      });
    }

    if (Object.keys(patch).length === 0) {
      gamesSkipped += 1;
      continue;
    }

    await ctx.db.patch(gameInput.gameId, patch);
    gamesPatched += 1;
  }

  return {
    sessionsProcessed: args.sessions.length,
    sessionsPatched,
    sessionsSkipped,
    gamesProcessed: args.games.length,
    gamesPatched,
    gamesSkipped,
    warnings,
  };
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
    const batch = await ctx.runQuery(getBatchByIdForDispatchQuery, {
      batchId: args.batchId,
    });

    if (!batch || batch.userId !== args.userId || batch.status !== 'queued') {
      return;
    }

    if (batch.r2Key !== args.r2Key) {
      await ctx.runMutation(updateBatchStatusForDispatchMutation, {
        batchId: args.batchId,
        status: 'failed',
        completedAt: Date.now(),
        errorMessage: 'Import queue dispatch blocked: batch key mismatch',
      });
      return;
    }

    const workerBaseUrl = process.env.IMPORT_WORKER_URL?.trim();
    const queueHmacSecret =
      process.env.IMPORT_QUEUE_HMAC_SECRET?.trim() ??
      process.env.IMPORT_CALLBACK_HMAC_SECRET?.trim();

    if (!workerBaseUrl || !queueHmacSecret) {
      await ctx.runMutation(updateBatchStatusForDispatchMutation, {
        batchId: args.batchId,
        status: 'failed',
        completedAt: Date.now(),
        errorMessage:
          'Import queue dispatch is not configured (IMPORT_WORKER_URL/IMPORT_QUEUE_HMAC_SECRET)',
      });
      return;
    }

    const configuredQueuePath =
      process.env.IMPORT_WORKER_QUEUE_PATH?.trim() || '/imports/queue';
    const queuePath = configuredQueuePath.startsWith('/')
      ? configuredQueuePath
      : `/${configuredQueuePath}`;

    if (queuePath !== '/imports/queue' && queuePath !== '/imports/process') {
      await ctx.runMutation(updateBatchStatusForDispatchMutation, {
        batchId: args.batchId,
        status: 'failed',
        completedAt: Date.now(),
        errorMessage:
          'Import queue dispatch is misconfigured (IMPORT_WORKER_QUEUE_PATH must be /imports/queue or /imports/process)',
      });
      return;
    }
    const normalizedWorkerUrl = workerBaseUrl.replace(/\/+$/, '');
    const endpoint = `${normalizedWorkerUrl}${queuePath}`;
    const requestBody = JSON.stringify({
      batchId: args.batchId,
      userId: args.userId,
      r2Key: args.r2Key,
      timezoneOffsetMinutes: normalizeTimezoneOffsetMinutes(
        args.timezoneOffsetMinutes
      ),
    });
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomUUID();
    const bodyHash = await sha256Hex(requestBody);
    const signingPayload = `POST\n${queuePath}\n${String(timestampSeconds)}\n${nonce}\n${bodyHash}`;
    const signature = await hmacSha256Hex(queueHmacSecret, signingPayload);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-import-ts': String(timestampSeconds),
          'x-import-nonce': nonce,
          'x-import-signature': signature,
        },
        body: requestBody,
      });

      if (response.ok) {
        return;
      }

      const responseBody = (await response.text()).slice(0, 350);
      await ctx.runMutation(updateBatchStatusForDispatchMutation, {
        batchId: args.batchId,
        status: 'failed',
        completedAt: Date.now(),
        errorMessage: `Queue dispatch failed (${String(response.status)}): ${responseBody}`,
      });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message.slice(0, 350)
          : 'Unknown queue dispatch error';

      await ctx.runMutation(updateBatchStatusForDispatchMutation, {
        batchId: args.batchId,
        status: 'failed',
        completedAt: Date.now(),
        errorMessage: `Queue dispatch failed: ${message}`,
      });
    }
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

    const deleteUserDocsChunkForImportMutation = makeFunctionReference<
      'mutation',
      {
        userId: Id<'users'>;
        table: ReplaceAllCleanupTable;
        chunkSize?: number;
      },
      { deleted: number }
    >('imports:deleteUserDocsChunkForImport');

    await clearUserImportDataInChunks(async (table) => {
      const result = await ctx.runMutation(
        deleteUserDocsChunkForImportMutation,
        {
          userId,
          table,
          chunkSize: DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE,
        }
      );
      return result.deleted;
    });

    const createImportBatchForSnapshotMutation = makeFunctionReference<
      'mutation',
      {
        userId: Id<'users'>;
        sourceFileName?: string | null;
        sourceHash?: string | null;
      },
      Id<'importBatches'>
    >('imports:createImportBatchForSnapshot');

    const batchId = await ctx.runMutation(
      createImportBatchForSnapshotMutation,
      {
        userId,
        sourceFileName: args.sourceFileName,
        sourceHash: args.sourceHash,
      }
    );

    const persistRawImportChunkForBatchMutation = makeFunctionReference<
      'mutation',
      {
        batchId: Id<'importBatches'>;
        table: RawImportTable;
        rows: unknown[];
      },
      { inserted: number }
    >('imports:persistRawImportChunkForBatch');

    const rawChunkSize = DEFAULT_RAW_IMPORT_CHUNK_SIZE;

    for (const [table, rows] of [
      ['importRawHouses', args.houses],
      ['importRawPatterns', args.patterns],
      ['importRawBalls', args.balls],
      ['importRawLeagues', args.leagues],
      ['importRawWeeks', args.weeks],
      ['importRawGames', args.games],
      ['importRawFrames', args.frames],
    ] as const) {
      const chunks = chunkRows(rows, rawChunkSize);

      for (const chunk of chunks) {
        await ctx.runMutation(persistRawImportChunkForBatchMutation, {
          batchId,
          table,
          rows: chunk,
        });
      }
    }

    const importSqliteSnapshotAfterCleanupMutation = makeFunctionReference<
      'mutation',
      {
        userId: Id<'users'>;
        batchId?: Id<'importBatches'> | null;
        skipRawMirrorPersistence?: boolean;
        sourceFileName?: string | null;
        sourceHash?: string | null;
        houses: Array<Doc<'importRawHouses'>['raw']>;
        patterns: Array<Doc<'importRawPatterns'>['raw']>;
        balls: Array<Doc<'importRawBalls'>['raw']>;
        leagues: Array<Doc<'importRawLeagues'>['raw']>;
        weeks: Array<Doc<'importRawWeeks'>['raw']>;
        games: Array<Doc<'importRawGames'>['raw']>;
        frames: Array<Doc<'importRawFrames'>['raw']>;
      },
      ImportResult
    >('imports:importSqliteSnapshotAfterCleanupForUser');

    return ctx.runMutation(importSqliteSnapshotAfterCleanupMutation, {
      userId,
      batchId,
      skipRawMirrorPersistence: true,
      sourceFileName: args.sourceFileName,
      sourceHash: args.sourceHash,
      houses: args.houses,
      patterns: args.patterns,
      balls: args.balls,
      leagues: args.leagues,
      weeks: args.weeks,
      games: args.games,
      frames: args.frames,
    });
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
