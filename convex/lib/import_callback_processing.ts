import { makeFunctionReference } from 'convex/server';

import {
  isAllowedTransition,
  type CallbackStage,
} from './import_callback_validation';
import {
  buildCanonicalFrameInserts,
  chunkCanonicalFrameInserts,
  DEFAULT_CANONICAL_FRAME_CHUNK_SIZE,
} from './import_canonical_frames';
import { chunkRawFrameRows } from './import_raw_frames';
import { parseSnapshotJsonPayload } from './import_snapshot';
import {
  DEFAULT_RAW_IMPORT_CHUNK_SIZE,
  DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE,
  REPLACE_ALL_CLEANUP_TABLES,
} from './import_types';

import type {
  CallbackPayload,
  CallbackSnapshot,
} from './import_callback_payload';
import type { Id } from '../_generated/dataModel';

const getBatchByIdForCallbackQuery = makeFunctionReference<
  'query',
  { batchId: Id<'importBatches'> },
  { _id: Id<'importBatches'>; userId: Id<'users'>; status: string } | null
>('imports:getBatchByIdForCallback');

const updateBatchStatusForCallbackMutation = makeFunctionReference<
  'mutation',
  {
    batchId: Id<'importBatches'>;
    status: 'parsing' | 'importing' | 'completed' | 'failed';
    completedAt?: number | null;
    errorMessage?: string | null;
  },
  Id<'importBatches'>
>('imports:updateBatchStatusForCallback');

const deleteUserDocsChunkForImportMutation = makeFunctionReference<
  'mutation',
  {
    userId: Id<'users'>;
    table: import('./import_types').ReplaceAllCleanupTable;
    chunkSize?: number;
  },
  { deleted: number }
>('imports:deleteUserDocsChunkForImport');

const submitParsedSnapshotForCallbackMutation = makeFunctionReference<
  'mutation',
  {
    batchId: Id<'importBatches'>;
    parserVersion?: string | null;
    skipReplaceAllCleanup?: boolean;
    skipRawMirrorPersistence?: boolean;
    timezoneOffsetMinutes?: number | null;
    snapshot: unknown;
  },
  {
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
    refinement: {
      sessionsProcessed: number;
      sessionsPatched: number;
      sessionsSkipped: number;
      gamesProcessed: number;
      gamesPatched: number;
      gamesSkipped: number;
      warnings: Array<{
        recordType: 'session' | 'game';
        recordId: string;
        message: string;
      }>;
    };
    warnings: Array<{
      recordType: 'session' | 'game';
      recordId: string;
      message: string;
    }>;
    gameIdMappings: Array<{ sqliteGameId: number; gameId: Id<'games'> }>;
    ballIdMappings: Array<{ sqliteBallId: number; ballId: Id<'balls'> }>;
  }
>('imports:submitParsedSnapshotForCallback');

const submitParsedSnapshotJsonForCallbackMutation = makeFunctionReference<
  'mutation',
  {
    batchId: Id<'importBatches'>;
    parserVersion?: string | null;
    skipReplaceAllCleanup?: boolean;
    skipRawMirrorPersistence?: boolean;
    timezoneOffsetMinutes?: number | null;
    snapshotJson: string;
  },
  {
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
    refinement: {
      sessionsProcessed: number;
      sessionsPatched: number;
      sessionsSkipped: number;
      gamesProcessed: number;
      gamesPatched: number;
      gamesSkipped: number;
      warnings: Array<{
        recordType: 'session' | 'game';
        recordId: string;
        message: string;
      }>;
    };
    warnings: Array<{
      recordType: 'session' | 'game';
      recordId: string;
      message: string;
    }>;
    gameIdMappings: Array<{ sqliteGameId: number; gameId: Id<'games'> }>;
    ballIdMappings: Array<{ sqliteBallId: number; ballId: Id<'balls'> }>;
  }
>('imports:submitParsedSnapshotJsonForCallback');

const persistCanonicalFrameChunkForCallbackMutation = makeFunctionReference<
  'mutation',
  {
    batchId: Id<'importBatches'>;
    frames: Array<{
      gameId: Id<'games'>;
      frameNumber: number;
      roll1: number;
      roll2: number | null;
      roll3: number | null;
      ballId: Id<'balls'> | null;
      pins: number | null;
      scores: number | null;
      score: number | null;
      flags: number | null;
      pocket: number | null;
      footBoard: number | null;
      targetBoard: number | null;
    }>;
  },
  { inserted: number }
>('imports:persistCanonicalFrameChunkForCallback');

const persistRawImportChunkForBatchMutation = makeFunctionReference<
  'mutation',
  {
    batchId: Id<'importBatches'>;
    table: import('./import_types').RawImportTable;
    rows: unknown[];
  },
  { inserted: number }
>('imports:persistRawImportChunkForBatch');

const completeSnapshotImportForCallbackMutation = makeFunctionReference<
  'mutation',
  {
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
    refinement: {
      sessionsProcessed: number;
      sessionsPatched: number;
      sessionsSkipped: number;
      gamesProcessed: number;
      gamesPatched: number;
      gamesSkipped: number;
      warnings: Array<{
        recordType: 'session' | 'game';
        recordId: string;
        message: string;
      }>;
    };
    warnings: Array<{
      recordType: 'session' | 'game';
      recordId: string;
      message: string;
    }>;
  },
  Id<'importBatches'>
>('imports:completeSnapshotImportForCallback');

type CallbackActionCtx = {
  runQuery: unknown;
  runMutation: unknown;
};

type CallbackBatch = {
  _id: Id<'importBatches'>;
  userId: Id<'users'>;
  status: string;
};

type CallbackProcessResult = {
  status: number;
  body: Record<string, unknown>;
};

async function runReplaceAllCleanup(
  runMutation: (mutationRef: unknown, args: unknown) => Promise<unknown>,
  userId: Id<'users'>
) {
  for (const table of REPLACE_ALL_CLEANUP_TABLES) {
    let deleted = 0;

    do {
      const result = (await runMutation(deleteUserDocsChunkForImportMutation, {
        userId,
        table,
        chunkSize: DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE,
      })) as { deleted: number };
      deleted = result.deleted;
    } while (deleted > 0);
  }
}

async function persistRawImportMirror(
  runMutation: (mutationRef: unknown, args: unknown) => Promise<unknown>,
  batchId: Id<'importBatches'>,
  snapshot: CallbackSnapshot
) {
  for (const [table, rows] of [
    ['importRawHouses', snapshot.houses],
    ['importRawPatterns', snapshot.patterns],
    ['importRawBalls', snapshot.balls],
    ['importRawLeagues', snapshot.leagues],
    ['importRawWeeks', snapshot.weeks],
    ['importRawGames', snapshot.games],
    ['importRawFrames', snapshot.frames],
  ] as const) {
    const chunks = chunkRawFrameRows(
      rows as Array<{ sqliteId: number }>,
      DEFAULT_RAW_IMPORT_CHUNK_SIZE
    );

    for (const chunk of chunks) {
      await runMutation(persistRawImportChunkForBatchMutation, {
        batchId,
        table,
        rows: chunk,
      });
    }
  }
}

async function persistCanonicalFrames(
  runMutation: (mutationRef: unknown, args: unknown) => Promise<unknown>,
  batchId: Id<'importBatches'>,
  snapshot: CallbackSnapshot,
  importResult: {
    gameIdMappings: Array<{ sqliteGameId: number; gameId: Id<'games'> }>;
    ballIdMappings: Array<{ sqliteBallId: number; ballId: Id<'balls'> }>;
  }
) {
  const frameInserts = buildCanonicalFrameInserts({
    frames: snapshot.frames,
    gameIdMappings: importResult.gameIdMappings,
    ballIdMappings: importResult.ballIdMappings,
  });
  const frameChunks = chunkCanonicalFrameInserts(
    frameInserts,
    DEFAULT_CANONICAL_FRAME_CHUNK_SIZE
  );

  for (const chunk of frameChunks) {
    await runMutation(persistCanonicalFrameChunkForCallbackMutation, {
      batchId,
      frames: chunk,
    });
  }
}

async function updateBatchStatus(
  runMutation: (mutationRef: unknown, args: unknown) => Promise<unknown>,
  batchId: Id<'importBatches'>,
  stage: CallbackStage,
  errorMessage?: string | null
) {
  const isTerminal = stage === 'completed' || stage === 'failed';

  await runMutation(updateBatchStatusForCallbackMutation, {
    batchId,
    status: stage,
    completedAt: isTerminal ? Date.now() : null,
    errorMessage:
      stage === 'failed'
        ? (errorMessage?.trim().slice(0, 500) ?? 'Import failed')
        : null,
  });
}

async function processSnapshotPayload(
  runMutation: (mutationRef: unknown, args: unknown) => Promise<unknown>,
  batch: CallbackBatch,
  payload: CallbackPayload,
  hasSnapshotJson: boolean
): Promise<CallbackProcessResult> {
  try {
    const parsedSnapshotJson = hasSnapshotJson
      ? parseSnapshotJsonPayload<CallbackSnapshot>(
          payload.snapshotJson as string
        )
      : null;

    await runReplaceAllCleanup(runMutation, batch.userId);

    const importResult = (
      hasSnapshotJson
        ? await runMutation(submitParsedSnapshotJsonForCallbackMutation, {
            batchId: batch._id,
            parserVersion: payload.parserVersion ?? null,
            skipReplaceAllCleanup: true,
            skipRawMirrorPersistence: true,
            timezoneOffsetMinutes: payload.timezoneOffsetMinutes ?? null,
            snapshotJson: payload.snapshotJson as string,
          })
        : await runMutation(submitParsedSnapshotForCallbackMutation, {
            batchId: batch._id,
            parserVersion: payload.parserVersion ?? null,
            skipReplaceAllCleanup: true,
            skipRawMirrorPersistence: true,
            timezoneOffsetMinutes: payload.timezoneOffsetMinutes ?? null,
            snapshot: payload.snapshot,
          })
    ) as {
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
      refinement: {
        sessionsProcessed: number;
        sessionsPatched: number;
        sessionsSkipped: number;
        gamesProcessed: number;
        gamesPatched: number;
        gamesSkipped: number;
        warnings: Array<{
          recordType: 'session' | 'game';
          recordId: string;
          message: string;
        }>;
      };
      warnings: Array<{
        recordType: 'session' | 'game';
        recordId: string;
        message: string;
      }>;
      gameIdMappings: Array<{ sqliteGameId: number; gameId: Id<'games'> }>;
      ballIdMappings: Array<{ sqliteBallId: number; ballId: Id<'balls'> }>;
    };

    const snapshot =
      parsedSnapshotJson ?? (payload.snapshot as CallbackSnapshot);

    await persistRawImportMirror(runMutation, batch._id, snapshot);
    await persistCanonicalFrames(
      runMutation,
      batch._id,
      snapshot,
      importResult
    );

    await runMutation(completeSnapshotImportForCallbackMutation, {
      batchId: batch._id,
      counts: importResult.counts,
      refinement: importResult.refinement,
      warnings: importResult.warnings,
    });

    return {
      status: 200,
      body: {
        ok: true,
        batchId: batch._id,
        status: 'completed',
        result: {
          batchId: importResult.batchId,
          counts: importResult.counts,
          refinement: importResult.refinement,
          warnings: importResult.warnings,
        },
      },
    };
  } catch (caught) {
    const message =
      caught instanceof Error
        ? caught.message.slice(0, 500)
        : 'Failed to process parsed snapshot';

    await runMutation(updateBatchStatusForCallbackMutation, {
      batchId: batch._id,
      status: 'failed',
      completedAt: Date.now(),
      errorMessage: message,
    });

    return {
      status: 500,
      body: {
        error: message,
      },
    };
  }
}

export async function processImportCallbackPayload(
  ctx: CallbackActionCtx,
  payload: CallbackPayload,
  snapshotValidation: {
    hasSnapshot: boolean;
    hasSnapshotJson: boolean;
  }
): Promise<CallbackProcessResult> {
  const runQuery = ctx.runQuery as (
    queryRef: unknown,
    args: unknown
  ) => Promise<unknown>;
  const runMutation = ctx.runMutation as (
    mutationRef: unknown,
    args: unknown
  ) => Promise<unknown>;
  const batch = (await runQuery(getBatchByIdForCallbackQuery, {
    batchId: payload.batchId as Id<'importBatches'>,
  })) as CallbackBatch | null;

  if (!batch) {
    return {
      status: 404,
      body: {
        error: 'Import batch not found',
      },
    };
  }

  if (!isAllowedTransition(batch.status, payload.stage)) {
    return {
      status: 409,
      body: {
        error: `Invalid status transition from ${batch.status} to ${payload.stage}`,
      },
    };
  }

  if (snapshotValidation.hasSnapshot || snapshotValidation.hasSnapshotJson) {
    return processSnapshotPayload(
      runMutation,
      batch,
      payload,
      snapshotValidation.hasSnapshotJson
    );
  }

  await updateBatchStatus(
    runMutation,
    batch._id,
    payload.stage,
    payload.errorMessage
  );

  return {
    status: 200,
    body: {
      ok: true,
      batchId: batch._id,
      status: payload.stage,
    },
  };
}
