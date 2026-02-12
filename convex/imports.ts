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
import { hmacSha256Hex, sha256Hex } from './lib/import_callback_hmac';
import { computeImportedGameStats } from './lib/import_game_stats';
import {
  laneContextFromLane,
  normalizeBallSwitches,
  normalizeLaneContext,
  normalizeNullableInteger,
  normalizeOptionalText,
} from './lib/import_refinement';
import { parseSnapshotJsonPayload } from './lib/import_snapshot';
import { summarizeImportWarnings } from './lib/import_warning_summary';

import type { Doc, Id, TableNames } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import type {
  BallSwitchInput,
  LaneContextInput,
} from './lib/import_refinement';

type SessionRefinementInput = {
  sessionId: Id<'sessions'>;
  laneContext?: LaneContextInput | null;
  notes?: string | null;
};

type GameRefinementInput = {
  gameId: Id<'games'>;
  handicap?: number | null;
  laneContext?: LaneContextInput | null;
  ballSwitches?: BallSwitchInput[] | null;
  notes?: string | null;
};

type RefinementWarning = {
  recordType: 'session' | 'game';
  recordId: string;
  message: string;
};

type RefinementResult = {
  sessionsProcessed: number;
  sessionsPatched: number;
  sessionsSkipped: number;
  gamesProcessed: number;
  gamesPatched: number;
  gamesSkipped: number;
  warnings: RefinementWarning[];
};

type ImportResult = {
  batchId: Id<'importBatches'>;
  counts: {
    houses: number;
    leagues: number;
    weeks: number;
    sessions: number;
    balls: number;
    games: number;
    frames: number;
    patterns: number;
  };
  refinement: RefinementResult;
  warnings: RefinementWarning[];
};

type SnapshotImportCoreResult = ImportResult & {
  gameIdMappings: Array<{ sqliteGameId: number; gameId: Id<'games'> }>;
  ballIdMappings: Array<{ sqliteBallId: number; ballId: Id<'balls'> }>;
};

type SqliteSnapshotInput = {
  sourceFileName?: string | null;
  sourceHash?: string | null;
  houses: Array<Doc<'importRawHouses'>['raw']>;
  patterns: Array<Doc<'importRawPatterns'>['raw']>;
  balls: Array<Doc<'importRawBalls'>['raw']>;
  leagues: Array<Doc<'importRawLeagues'>['raw']>;
  weeks: Array<Doc<'importRawWeeks'>['raw']>;
  games: Array<Doc<'importRawGames'>['raw']>;
  frames: Array<Doc<'importRawFrames'>['raw']>;
};

const EMPTY_IMPORT_COUNTS = {
  houses: 0,
  leagues: 0,
  weeks: 0,
  sessions: 0,
  balls: 0,
  games: 0,
  frames: 0,
  patterns: 0,
  gamesRefined: 0,
  gamesPatched: 0,
  warnings: 0,
} as const;

const REPLACE_ALL_CLEANUP_TABLES = [
  'frames',
  'games',
  'sessions',
  'leagues',
  'balls',
  'importRawGames',
  'importRawFrames',
  'importRawWeeks',
  'importRawLeagues',
  'importRawBalls',
  'importRawPatterns',
  'importRawHouses',
] as const;

type ReplaceAllCleanupTable = (typeof REPLACE_ALL_CLEANUP_TABLES)[number];

const DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE = 128;

const laneContextValidator = v.object({
  leftLane: v.optional(v.union(v.number(), v.null())),
  rightLane: v.optional(v.union(v.number(), v.null())),
  lanePair: v.optional(v.union(v.string(), v.null())),
  startingLane: v.optional(v.union(v.number(), v.null())),
});

const ballSwitchValidator = v.object({
  frameNumber: v.number(),
  rollNumber: v.optional(v.union(v.number(), v.null())),
  ballId: v.optional(v.union(v.id('balls'), v.null())),
  ballName: v.optional(v.union(v.string(), v.null())),
  note: v.optional(v.union(v.string(), v.null())),
});

const sqliteHouseValidator = v.object({
  sqliteId: v.number(),
  name: v.optional(v.union(v.string(), v.null())),
  sortOrder: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  location: v.optional(v.union(v.string(), v.null())),
});

const sqlitePatternValidator = v.object({
  sqliteId: v.number(),
  name: v.optional(v.union(v.string(), v.null())),
  sortOrder: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  length: v.optional(v.union(v.number(), v.null())),
});

const sqliteBallValidator = v.object({
  sqliteId: v.number(),
  name: v.optional(v.union(v.string(), v.null())),
  sortOrder: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  brand: v.optional(v.union(v.string(), v.null())),
  coverstock: v.optional(v.union(v.string(), v.null())),
});

const sqliteLeagueValidator = v.object({
  sqliteId: v.number(),
  ballFk: v.optional(v.union(v.number(), v.null())),
  patternFk: v.optional(v.union(v.number(), v.null())),
  houseFk: v.optional(v.union(v.number(), v.null())),
  name: v.optional(v.union(v.string(), v.null())),
  games: v.optional(v.union(v.number(), v.null())),
  notes: v.optional(v.union(v.string(), v.null())),
  sortOrder: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
});

const sqliteWeekValidator = v.object({
  sqliteId: v.number(),
  leagueFk: v.optional(v.union(v.number(), v.null())),
  ballFk: v.optional(v.union(v.number(), v.null())),
  patternFk: v.optional(v.union(v.number(), v.null())),
  houseFk: v.optional(v.union(v.number(), v.null())),
  date: v.optional(v.union(v.number(), v.string(), v.null())),
  notes: v.optional(v.union(v.string(), v.null())),
  lane: v.optional(v.union(v.number(), v.null())),
});

const sqliteGameValidator = v.object({
  sqliteId: v.number(),
  weekFk: v.optional(v.union(v.number(), v.null())),
  leagueFk: v.optional(v.union(v.number(), v.null())),
  ballFk: v.optional(v.union(v.number(), v.null())),
  patternFk: v.optional(v.union(v.number(), v.null())),
  houseFk: v.optional(v.union(v.number(), v.null())),
  score: v.optional(v.union(v.number(), v.null())),
  frame: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  singlePinSpareScore: v.optional(v.union(v.number(), v.null())),
  notes: v.optional(v.union(v.string(), v.null())),
  lane: v.optional(v.union(v.number(), v.null())),
  date: v.optional(v.union(v.number(), v.string(), v.null())),
});

const sqliteFrameValidator = v.object({
  sqliteId: v.number(),
  gameFk: v.optional(v.union(v.number(), v.null())),
  weekFk: v.optional(v.union(v.number(), v.null())),
  leagueFk: v.optional(v.union(v.number(), v.null())),
  ballFk: v.optional(v.union(v.number(), v.null())),
  frameNum: v.optional(v.union(v.number(), v.null())),
  pins: v.optional(v.union(v.number(), v.null())),
  scores: v.optional(v.union(v.number(), v.null())),
  score: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  pocket: v.optional(v.union(v.number(), v.null())),
  footBoard: v.optional(v.union(v.number(), v.null())),
  targetBoard: v.optional(v.union(v.number(), v.null())),
});

const canonicalFrameInsertValidator = v.object({
  gameId: v.id('games'),
  frameNumber: v.number(),
  roll1: v.number(),
  roll2: v.union(v.number(), v.null()),
  roll3: v.union(v.number(), v.null()),
  ballId: v.union(v.id('balls'), v.null()),
  pins: v.union(v.number(), v.null()),
  scores: v.union(v.number(), v.null()),
  score: v.union(v.number(), v.null()),
  flags: v.union(v.number(), v.null()),
  pocket: v.union(v.number(), v.null()),
  footBoard: v.union(v.number(), v.null()),
  targetBoard: v.union(v.number(), v.null()),
});

const rawFrameInsertValidator = v.object({
  sqliteId: v.number(),
  gameFk: v.optional(v.union(v.number(), v.null())),
  weekFk: v.optional(v.union(v.number(), v.null())),
  leagueFk: v.optional(v.union(v.number(), v.null())),
  ballFk: v.optional(v.union(v.number(), v.null())),
  frameNum: v.optional(v.union(v.number(), v.null())),
  pins: v.optional(v.union(v.number(), v.null())),
  scores: v.optional(v.union(v.number(), v.null())),
  score: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  pocket: v.optional(v.union(v.number(), v.null())),
  footBoard: v.optional(v.union(v.number(), v.null())),
  targetBoard: v.optional(v.union(v.number(), v.null())),
});

const replaceAllCleanupTableValidator = v.union(
  v.literal('frames'),
  v.literal('games'),
  v.literal('sessions'),
  v.literal('leagues'),
  v.literal('balls'),
  v.literal('importRawGames'),
  v.literal('importRawFrames'),
  v.literal('importRawWeeks'),
  v.literal('importRawLeagues'),
  v.literal('importRawBalls'),
  v.literal('importRawPatterns'),
  v.literal('importRawHouses')
);

const sqliteSnapshotArgs = {
  sourceFileName: v.optional(v.union(v.string(), v.null())),
  sourceHash: v.optional(v.union(v.string(), v.null())),
  houses: v.array(sqliteHouseValidator),
  patterns: v.array(sqlitePatternValidator),
  balls: v.array(sqliteBallValidator),
  leagues: v.array(sqliteLeagueValidator),
  weeks: v.array(sqliteWeekValidator),
  games: v.array(sqliteGameValidator),
  frames: v.array(sqliteFrameValidator),
};

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
  },
  void
>('imports:dispatchImportQueue');

function hasOwn(object: object, property: string) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function normalizeName(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value, 120);
  return normalized;
}

function validateR2KeyOwnership(userId: Id<'users'>, r2Key: string) {
  const expectedPrefix = `imports/${String(userId)}/`;

  if (!r2Key.startsWith(expectedPrefix)) {
    throw new ConvexError('r2Key must be scoped to the authenticated user');
  }
}

function normalizeDate(
  value: number | string | null | undefined,
  label: string,
  fallbackDate: string
): { date: string; warning: string | null } {
  if (value === undefined || value === null) {
    return { date: fallbackDate, warning: null };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length >= 10) {
      return {
        date: trimmed.slice(0, 10),
        warning: null,
      };
    }

    return {
      date: fallbackDate,
      warning: `${label}: invalid string date, used fallback`,
    };
  }

  let timestampMs = value;

  if (Math.abs(value) < 10_000_000_000) {
    timestampMs = value * 1000;
  }

  const parsed = new Date(timestampMs);

  if (Number.isNaN(parsed.getTime())) {
    return {
      date: fallbackDate,
      warning: `${label}: invalid numeric date, used fallback`,
    };
  }

  return {
    date: parsed.toISOString().slice(0, 10),
    warning: null,
  };
}

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

async function deleteUserDocsChunkForImportTable(
  ctx: MutationCtx,
  userId: Id<'users'>,
  table: ReplaceAllCleanupTable,
  chunkSize: number
) {
  const docs = await takeUserDocsForCleanup(ctx, userId, table, chunkSize);
  await deleteDocsById(ctx, docs as Array<{ _id: Id<TableNames> }>);
  return docs.length;
}

async function clearUserImportDataInChunks(
  runChunkDelete: (table: ReplaceAllCleanupTable) => Promise<number>
) {
  for (const table of REPLACE_ALL_CLEANUP_TABLES) {
    let deleted = 0;

    do {
      deleted = await runChunkDelete(table);
    } while (deleted > 0);
  }
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

function toPublicImportResult(result: SnapshotImportCoreResult): ImportResult {
  return {
    batchId: result.batchId,
    counts: result.counts,
    refinement: result.refinement,
    warnings: result.warnings,
  };
}

async function completeImportBatch(
  ctx: MutationCtx,
  args: {
    batchId: Id<'importBatches'>;
    counts: ImportResult['counts'];
    refinement: RefinementResult;
    warnings: RefinementWarning[];
  }
) {
  await ctx.db.patch(args.batchId, {
    status: 'completed',
    errorMessage: null,
    completedAt: Date.now(),
    counts: {
      houses: args.counts.houses,
      leagues: args.counts.leagues,
      weeks: args.counts.weeks,
      sessions: args.counts.sessions,
      balls: args.counts.balls,
      games: args.counts.games,
      frames: args.counts.frames,
      patterns: args.counts.patterns,
      gamesRefined: args.refinement.gamesProcessed,
      gamesPatched: args.refinement.gamesPatched,
      warnings: args.warnings.length,
    },
  });
}

async function runSqliteSnapshotImportCore(
  ctx: MutationCtx,
  userId: Id<'users'>,
  args: SqliteSnapshotInput,
  existingBatchId?: Id<'importBatches'>,
  options?: {
    skipReplaceAllCleanup?: boolean;
  }
): Promise<SnapshotImportCoreResult> {
  const importedAt = Date.now();
  const today = new Date(importedAt).toISOString().slice(0, 10);
  const importWarnings: RefinementWarning[] = [];

  if (!options?.skipReplaceAllCleanup) {
    await clearUserImportDataInChunks((table) =>
      deleteUserDocsChunkForImportTable(
        ctx,
        userId,
        table,
        DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE
      )
    );
  }

  let batchId: Id<'importBatches'>;

  if (existingBatchId) {
    const existingBatch = await ctx.db.get(existingBatchId);

    if (!existingBatch || existingBatch.userId !== userId) {
      throw new ConvexError('Import batch not found for user');
    }

    await ctx.db.patch(existingBatchId, {
      sourceType: 'sqlite',
      sourceFileName:
        normalizeOptionalText(args.sourceFileName, 255) ??
        existingBatch.sourceFileName ??
        null,
      sourceHash:
        normalizeOptionalText(args.sourceHash, 128) ??
        existingBatch.sourceHash ??
        null,
      status: 'importing',
      errorMessage: null,
      completedAt: null,
      counts: { ...EMPTY_IMPORT_COUNTS },
    });
    batchId = existingBatchId;
  } else {
    batchId = await ctx.db.insert('importBatches', {
      userId,
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

  const houseIdMap = new Map<number, Id<'houses'>>();
  const houseByName = new Map<string, Id<'houses'>>();

  for (const row of args.houses) {
    await ctx.db.insert('importRawHouses', {
      userId,
      batchId,
      sqliteId: row.sqliteId,
      raw: row,
      importedAt,
    });

    const name = normalizeName(row.name);

    if (!name) {
      importWarnings.push({
        recordType: 'session',
        recordId: String(row.sqliteId),
        message: 'house is missing a valid name and was not normalized',
      });
      continue;
    }

    const key = name.toLowerCase();
    const cachedHouseId = houseByName.get(key);

    if (cachedHouseId) {
      houseIdMap.set(row.sqliteId, cachedHouseId);
      continue;
    }

    const existingHouse = await ctx.db
      .query('houses')
      .withIndex('by_name', (q) => q.eq('name', name))
      .first();

    if (existingHouse) {
      houseIdMap.set(row.sqliteId, existingHouse._id);
      houseByName.set(key, existingHouse._id);
      continue;
    }

    const createdHouseId = await ctx.db.insert('houses', {
      name,
      location: normalizeOptionalText(row.location, 180),
    });
    houseIdMap.set(row.sqliteId, createdHouseId);
    houseByName.set(key, createdHouseId);
  }

  const patternIdMap = new Map<number, Id<'patterns'>>();
  const patternByName = new Map<string, Id<'patterns'>>();

  for (const row of args.patterns) {
    await ctx.db.insert('importRawPatterns', {
      userId,
      batchId,
      sqliteId: row.sqliteId,
      raw: row,
      importedAt,
    });

    const name = normalizeName(row.name);

    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    const cachedPatternId = patternByName.get(key);

    if (cachedPatternId) {
      patternIdMap.set(row.sqliteId, cachedPatternId);
      continue;
    }

    const existingPattern = await ctx.db
      .query('patterns')
      .withIndex('by_name', (q) => q.eq('name', name))
      .first();

    if (existingPattern) {
      patternIdMap.set(row.sqliteId, existingPattern._id);
      patternByName.set(key, existingPattern._id);
      continue;
    }

    const createdPatternId = await ctx.db.insert('patterns', {
      name,
      length: normalizeNullableInteger(row.length, 0, 80),
    });
    patternIdMap.set(row.sqliteId, createdPatternId);
    patternByName.set(key, createdPatternId);
  }

  const ballIdMap = new Map<number, Id<'balls'>>();
  const ballNameBySqlite = new Map<number, string>();

  for (const row of args.balls) {
    await ctx.db.insert('importRawBalls', {
      userId,
      batchId,
      sqliteId: row.sqliteId,
      raw: row,
      importedAt,
    });

    const name = normalizeName(row.name);

    if (!name) {
      importWarnings.push({
        recordType: 'game',
        recordId: String(row.sqliteId),
        message: 'ball is missing a valid name and was not normalized',
      });
      continue;
    }

    ballNameBySqlite.set(row.sqliteId, name);

    const existingBall = await ctx.db
      .query('balls')
      .withIndex('by_user_name', (q) => q.eq('userId', userId).eq('name', name))
      .first();

    if (existingBall) {
      ballIdMap.set(row.sqliteId, existingBall._id);
      continue;
    }

    const createdBallId = await ctx.db.insert('balls', {
      userId,
      name,
      brand: normalizeOptionalText(row.brand, 120),
      coverstock: normalizeOptionalText(row.coverstock, 120),
    });
    ballIdMap.set(row.sqliteId, createdBallId);
  }

  const leagueIdMap = new Map<number, Id<'leagues'>>();

  for (const row of args.leagues) {
    await ctx.db.insert('importRawLeagues', {
      userId,
      batchId,
      sqliteId: row.sqliteId,
      raw: row,
      importedAt,
    });

    const name =
      normalizeName(row.name) ?? `Imported League ${String(row.sqliteId)}`;
    const houseId = row.houseFk ? (houseIdMap.get(row.houseFk) ?? null) : null;
    const houseName = houseId
      ? ((await ctx.db.get(houseId))?.name ?? null)
      : null;
    const leagueId = await ctx.db.insert('leagues', {
      userId,
      name,
      houseId,
      houseName,
      startDate: null,
      endDate: null,
      createdAt: importedAt,
    });
    leagueIdMap.set(row.sqliteId, leagueId);
  }

  const sessionIdMap = new Map<number, Id<'sessions'>>();
  const sessionDateMap = new Map<number, string>();
  const sessionLeagueMap = new Map<number, Id<'leagues'>>();

  for (const row of args.weeks) {
    await ctx.db.insert('importRawWeeks', {
      userId,
      batchId,
      sqliteId: row.sqliteId,
      raw: row,
      importedAt,
    });

    if (!row.leagueFk) {
      importWarnings.push({
        recordType: 'session',
        recordId: String(row.sqliteId),
        message: 'week is missing leagueFk and was skipped',
      });
      continue;
    }

    const leagueId = leagueIdMap.get(row.leagueFk);

    if (!leagueId) {
      importWarnings.push({
        recordType: 'session',
        recordId: String(row.sqliteId),
        message: `week leagueFk ${String(row.leagueFk)} was not imported`,
      });
      continue;
    }

    const weekDate = normalizeDate(
      row.date,
      `week ${String(row.sqliteId)}`,
      today
    );

    if (weekDate.warning) {
      importWarnings.push({
        recordType: 'session',
        recordId: String(row.sqliteId),
        message: weekDate.warning,
      });
    }

    const sessionId = await ctx.db.insert('sessions', {
      userId,
      leagueId,
      weekNumber: null,
      date: weekDate.date,
      houseId: row.houseFk ? (houseIdMap.get(row.houseFk) ?? null) : null,
      ballId: row.ballFk ? (ballIdMap.get(row.ballFk) ?? null) : null,
      patternId: row.patternFk
        ? (patternIdMap.get(row.patternFk) ?? null)
        : null,
      notes: null,
      laneContext: null,
    });
    sessionIdMap.set(row.sqliteId, sessionId);
    sessionDateMap.set(row.sqliteId, weekDate.date);
    sessionLeagueMap.set(row.sqliteId, leagueId);
  }

  const gameIdMap = new Map<number, Id<'games'>>();
  const framesByGame = new Map<number, typeof args.frames>();

  for (const row of args.frames) {
    if (!row.gameFk) {
      continue;
    }

    const existing = framesByGame.get(row.gameFk);

    if (existing) {
      existing.push(row);
    } else {
      framesByGame.set(row.gameFk, [row]);
    }
  }

  for (const row of args.games) {
    await ctx.db.insert('importRawGames', {
      userId,
      batchId,
      sqliteId: row.sqliteId,
      raw: row,
      importedAt,
    });

    if (!row.weekFk) {
      importWarnings.push({
        recordType: 'game',
        recordId: String(row.sqliteId),
        message: 'game is missing weekFk and was skipped',
      });
      continue;
    }

    const sessionId = sessionIdMap.get(row.weekFk);

    if (!sessionId) {
      importWarnings.push({
        recordType: 'game',
        recordId: String(row.sqliteId),
        message: `game weekFk ${String(row.weekFk)} was not imported`,
      });
      continue;
    }

    const leagueId =
      (row.leagueFk ? leagueIdMap.get(row.leagueFk) : undefined) ??
      sessionLeagueMap.get(row.weekFk);

    if (!leagueId) {
      importWarnings.push({
        recordType: 'game',
        recordId: String(row.sqliteId),
        message: 'game could not resolve leagueId and was skipped',
      });
      continue;
    }

    const gameDate = normalizeDate(
      row.date,
      `game ${String(row.sqliteId)}`,
      sessionDateMap.get(row.weekFk) ?? today
    );

    if (gameDate.warning) {
      importWarnings.push({
        recordType: 'game',
        recordId: String(row.sqliteId),
        message: gameDate.warning,
      });
    }

    const fallbackScore = normalizeNullableInteger(row.score, 0, 400) ?? 0;
    const computedStats = computeImportedGameStats(
      framesByGame.get(row.sqliteId) ?? [],
      fallbackScore
    );

    const gameId = await ctx.db.insert('games', {
      userId,
      sessionId,
      leagueId,
      date: gameDate.date,
      totalScore: computedStats.totalScore,
      strikes: computedStats.strikes,
      spares: computedStats.spares,
      opens: computedStats.opens,
      ballId: row.ballFk ? (ballIdMap.get(row.ballFk) ?? null) : null,
      patternId: row.patternFk
        ? (patternIdMap.get(row.patternFk) ?? null)
        : null,
      houseId: row.houseFk ? (houseIdMap.get(row.houseFk) ?? null) : null,
      handicap: null,
      notes: null,
      laneContext: null,
      ballSwitches: null,
    });
    gameIdMap.set(row.sqliteId, gameId);
  }

  const sessionRefinements: SessionRefinementInput[] = [];

  for (const week of args.weeks) {
    const sessionId = sessionIdMap.get(week.sqliteId);

    if (!sessionId) {
      continue;
    }

    const notes = normalizeOptionalText(week.notes);
    const laneContext = laneContextFromLane(week.lane);

    if (notes === null && laneContext === null) {
      continue;
    }

    sessionRefinements.push({
      sessionId,
      notes,
      laneContext,
    });
  }

  const gameRefinements: GameRefinementInput[] = [];

  for (const gameRow of args.games) {
    const gameId = gameIdMap.get(gameRow.sqliteId);

    if (!gameId) {
      continue;
    }

    const laneContext = laneContextFromLane(gameRow.lane);
    const notes = normalizeOptionalText(gameRow.notes);
    const rawFrames = framesByGame.get(gameRow.sqliteId) ?? [];
    const sortedFrames = [...rawFrames].sort((left, right) => {
      const leftFrame = left.frameNum ?? Number.MAX_SAFE_INTEGER;
      const rightFrame = right.frameNum ?? Number.MAX_SAFE_INTEGER;

      if (leftFrame !== rightFrame) {
        return leftFrame - rightFrame;
      }

      return left.sqliteId - right.sqliteId;
    });

    const ballSwitches: BallSwitchInput[] = [];
    let activeBallId = gameRow.ballFk
      ? (ballIdMap.get(gameRow.ballFk) ?? null)
      : null;

    for (const frame of sortedFrames) {
      if (!frame.ballFk) {
        continue;
      }

      const frameNumber = normalizeNullableInteger(frame.frameNum, 1, 10);

      if (frameNumber === null) {
        importWarnings.push({
          recordType: 'game',
          recordId: String(gameId),
          message: `frame ${String(frame.sqliteId)} has invalid frameNum for ball switch derivation`,
        });
        continue;
      }

      const nextBallId = ballIdMap.get(frame.ballFk) ?? null;

      if (nextBallId === activeBallId) {
        continue;
      }

      ballSwitches.push({
        frameNumber,
        rollNumber: null,
        ballId: nextBallId,
        ballName: ballNameBySqlite.get(frame.ballFk) ?? null,
        note: null,
      });
      activeBallId = nextBallId;
    }

    gameRefinements.push({
      gameId,
      handicap: null,
      notes,
      laneContext,
      ballSwitches: ballSwitches.length > 0 ? ballSwitches : null,
    });
  }

  if (args.games.length > 0) {
    importWarnings.push({
      recordType: 'game',
      recordId: 'all',
      message:
        'handicap source mapping is unresolved for this SQLite variant; handicap stored as null',
    });
  }

  const refinementResult = await applyRefinement(ctx, userId, {
    sessions: sessionRefinements,
    games: gameRefinements,
  });

  const warnings = summarizeImportWarnings([
    ...importWarnings,
    ...refinementResult.warnings,
  ]);

  return {
    batchId,
    counts: {
      houses: args.houses.length,
      leagues: args.leagues.length,
      weeks: args.weeks.length,
      sessions: sessionIdMap.size,
      balls: args.balls.length,
      games: gameIdMap.size,
      frames: args.frames.length,
      patterns: args.patterns.length,
    },
    refinement: refinementResult,
    warnings,
    gameIdMappings: [...gameIdMap.entries()].map(([sqliteGameId, gameId]) => ({
      sqliteGameId,
      gameId,
    })),
    ballIdMappings: [...ballIdMap.entries()].map(([sqliteBallId, ballId]) => ({
      sqliteBallId,
      ballId,
    })),
  };
}

async function runSqliteSnapshotImport(
  ctx: MutationCtx,
  userId: Id<'users'>,
  args: SqliteSnapshotInput,
  existingBatchId?: Id<'importBatches'>,
  options?: {
    skipReplaceAllCleanup?: boolean;
  }
) {
  const result = await runSqliteSnapshotImportCore(
    ctx,
    userId,
    args,
    existingBatchId,
    options
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

export const importSqliteSnapshotAfterCleanupForUser = internalMutation({
  args: {
    userId: v.id('users'),
    ...sqliteSnapshotArgs,
  },
  handler: async (ctx, args) => {
    const { userId, ...snapshotArgs } = args;
    return runSqliteSnapshotImport(ctx, userId, snapshotArgs, undefined, {
      skipReplaceAllCleanup: true,
    });
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

    const importSqliteSnapshotAfterCleanupMutation = makeFunctionReference<
      'mutation',
      {
        userId: Id<'users'>;
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
      }
    );
  },
});

export const submitParsedSnapshotJsonForCallback = internalMutation({
  args: {
    batchId: v.id('importBatches'),
    parserVersion: v.optional(v.union(v.string(), v.null())),
    skipReplaceAllCleanup: v.optional(v.boolean()),
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
    return runSqliteSnapshotImportCore(ctx, batch.userId, snapshot, batch._id, {
      skipReplaceAllCleanup: args.skipReplaceAllCleanup ?? false,
    });
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

export const persistRawFrameChunkForCallback = internalMutation({
  args: {
    batchId: v.id('importBatches'),
    frames: v.array(rawFrameInsertValidator),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);

    if (!batch) {
      throw new ConvexError('Import batch not found');
    }

    if (batch.status !== 'importing') {
      throw new ConvexError(
        'Import batch must be importing to persist raw frames'
      );
    }

    const importedAt = Date.now();

    for (const frame of args.frames) {
      await ctx.db.insert('importRawFrames', {
        userId: batch.userId,
        batchId: args.batchId,
        sqliteId: frame.sqliteId,
        raw: frame,
        importedAt,
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
