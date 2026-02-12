import { httpRouter, makeFunctionReference } from 'convex/server';

import { httpAction } from './_generated/server';
import { auth } from './auth';
import {
  hmacSha256Hex,
  sha256Hex,
  timingSafeEqualHex,
} from './lib/import_callback_hmac';
import {
  isAllowedTransition,
  isStage,
  validateSnapshotPayloadStage,
} from './lib/import_callback_validation';
import {
  buildCanonicalFrameInserts,
  chunkCanonicalFrameInserts,
  DEFAULT_CANONICAL_FRAME_CHUNK_SIZE,
} from './lib/import_canonical_frames';
import { chunkRawFrameRows } from './lib/import_raw_frames';
import { parseSnapshotJsonPayload } from './lib/import_snapshot';

import type { Id } from './_generated/dataModel';

const http = httpRouter();

const CALLBACK_PATH = '/api/import-callback';
const SKEW_MS = 5 * 60 * 1000;
const NONCE_TTL_MS = 15 * 60 * 1000;

const getNonceByValueForCallbackQuery = makeFunctionReference<
  'query',
  { nonce: string },
  { _id: Id<'importCallbackNonces'> } | null
>('imports:getNonceByValueForCallback');

const insertNonceForCallbackMutation = makeFunctionReference<
  'mutation',
  { nonce: string; createdAt: number; expiresAt: number },
  Id<'importCallbackNonces'>
>('imports:insertNonceForCallback');

const getBatchByIdForCallbackQuery = makeFunctionReference<
  'query',
  { batchId: Id<'importBatches'> },
  { _id: Id<'importBatches'>; userId: Id<'users'>; status: string } | null
>('imports:getBatchByIdForCallback');

const deleteUserDocsChunkForImportMutation = makeFunctionReference<
  'mutation',
  {
    userId: Id<'users'>;
    table:
      | 'frames'
      | 'games'
      | 'sessions'
      | 'leagues'
      | 'balls'
      | 'importRawGames'
      | 'importRawFrames'
      | 'importRawWeeks'
      | 'importRawLeagues'
      | 'importRawBalls'
      | 'importRawPatterns'
      | 'importRawHouses';
    chunkSize?: number;
  },
  { deleted: number }
>('imports:deleteUserDocsChunkForImport');

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

const submitParsedSnapshotForCallbackMutation = makeFunctionReference<
  'mutation',
  {
    batchId: Id<'importBatches'>;
    parserVersion?: string | null;
    skipReplaceAllCleanup?: boolean;
    skipRawMirrorPersistence?: boolean;
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
    table:
      | 'importRawHouses'
      | 'importRawPatterns'
      | 'importRawBalls'
      | 'importRawLeagues'
      | 'importRawWeeks'
      | 'importRawGames'
      | 'importRawFrames';
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

const REPLACE_ALL_DELETE_CHUNK_SIZE = 128;
const RAW_IMPORT_CHUNK_SIZE = 500;

type CallbackPayload = {
  batchId: string;
  stage: 'parsing' | 'importing' | 'completed' | 'failed';
  errorMessage?: string | null;
  parserVersion?: string | null;
  snapshot?: unknown;
  snapshotJson?: string;
};

type CallbackSnapshot = {
  houses: unknown[];
  patterns: unknown[];
  balls: unknown[];
  leagues: unknown[];
  weeks: unknown[];
  games: unknown[];
  frames: Array<{
    sqliteId: number;
    gameFk?: number | null;
    weekFk?: number | null;
    leagueFk?: number | null;
    ballFk?: number | null;
    frameNum?: number | null;
    pins?: number | null;
    scores?: number | null;
    score?: number | null;
    flags?: number | null;
    pocket?: number | null;
    footBoard?: number | null;
    targetBoard?: number | null;
  }>;
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

auth.addHttpRoutes(http);

http.route({
  path: CALLBACK_PATH,
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.IMPORT_CALLBACK_HMAC_SECRET;

    if (!secret) {
      return jsonResponse(500, {
        error: 'Server callback secret is not configured',
      });
    }

    const timestampHeader = request.headers.get('x-import-ts');
    const nonce = request.headers.get('x-import-nonce');
    const signature = request.headers.get('x-import-signature');

    if (!timestampHeader || !nonce || !signature) {
      return jsonResponse(401, {
        error: 'Missing callback signature headers',
      });
    }

    const timestampSeconds = Number(timestampHeader);

    if (!Number.isFinite(timestampSeconds)) {
      return jsonResponse(401, {
        error: 'Invalid callback timestamp header',
      });
    }

    const now = Date.now();

    if (Math.abs(now - timestampSeconds * 1000) > SKEW_MS) {
      return jsonResponse(401, {
        error: 'Callback timestamp outside allowed skew',
      });
    }

    if (nonce.length < 16 || nonce.length > 128) {
      return jsonResponse(401, {
        error: 'Invalid callback nonce',
      });
    }

    const existingNonce = await ctx.runQuery(getNonceByValueForCallbackQuery, {
      nonce,
    });

    if (existingNonce) {
      return jsonResponse(401, {
        error: 'Replay detected for callback nonce',
      });
    }

    const rawBody = await request.text();
    const bodyHash = await sha256Hex(rawBody);
    const signingPayload = `POST\n${CALLBACK_PATH}\n${timestampHeader}\n${nonce}\n${bodyHash}`;
    const expectedSignature = await hmacSha256Hex(secret, signingPayload);

    if (!timingSafeEqualHex(expectedSignature, signature)) {
      return jsonResponse(401, {
        error: 'Invalid callback signature',
      });
    }

    await ctx.runMutation(insertNonceForCallbackMutation, {
      nonce,
      createdAt: now,
      expiresAt: now + NONCE_TTL_MS,
    });

    let payload: CallbackPayload;

    try {
      payload = JSON.parse(rawBody) as CallbackPayload;
    } catch {
      return jsonResponse(400, {
        error: 'Invalid JSON callback payload',
      });
    }

    if (!payload.batchId || typeof payload.batchId !== 'string') {
      return jsonResponse(400, {
        error: 'batchId is required',
      });
    }

    if (!payload.stage || !isStage(payload.stage)) {
      return jsonResponse(400, {
        error: 'stage must be parsing|importing|completed|failed',
      });
    }

    const batch = await ctx.runQuery(getBatchByIdForCallbackQuery, {
      batchId: payload.batchId as Id<'importBatches'>,
    });

    if (!batch) {
      return jsonResponse(404, {
        error: 'Import batch not found',
      });
    }

    if (!isAllowedTransition(batch.status, payload.stage)) {
      return jsonResponse(409, {
        error: `Invalid status transition from ${batch.status} to ${payload.stage}`,
      });
    }

    const snapshotValidation = validateSnapshotPayloadStage(payload);

    if (snapshotValidation.error) {
      return jsonResponse(400, {
        error: snapshotValidation.error,
      });
    }

    if (snapshotValidation.hasSnapshot || snapshotValidation.hasSnapshotJson) {
      try {
        const parsedSnapshotJson = snapshotValidation.hasSnapshotJson
          ? parseSnapshotJsonPayload<CallbackSnapshot>(
              payload.snapshotJson as string
            )
          : null;

        for (const table of REPLACE_ALL_CLEANUP_TABLES) {
          let deleted = 0;

          do {
            const result = await ctx.runMutation(
              deleteUserDocsChunkForImportMutation,
              {
                userId: batch.userId,
                table,
                chunkSize: REPLACE_ALL_DELETE_CHUNK_SIZE,
              }
            );
            deleted = result.deleted;
          } while (deleted > 0);
        }

        const importResult = snapshotValidation.hasSnapshotJson
          ? await ctx.runMutation(submitParsedSnapshotJsonForCallbackMutation, {
              batchId: batch._id,
              parserVersion: payload.parserVersion ?? null,
              skipReplaceAllCleanup: true,
              skipRawMirrorPersistence: true,
              snapshotJson: payload.snapshotJson as string,
            })
          : await ctx.runMutation(submitParsedSnapshotForCallbackMutation, {
              batchId: batch._id,
              parserVersion: payload.parserVersion ?? null,
              skipReplaceAllCleanup: true,
              skipRawMirrorPersistence: true,
              snapshot: payload.snapshot,
            });

        const snapshot =
          parsedSnapshotJson ?? (payload.snapshot as CallbackSnapshot);

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
            RAW_IMPORT_CHUNK_SIZE
          );

          for (const chunk of chunks) {
            await ctx.runMutation(persistRawImportChunkForBatchMutation, {
              batchId: batch._id,
              table,
              rows: chunk,
            });
          }
        }

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
          await ctx.runMutation(persistCanonicalFrameChunkForCallbackMutation, {
            batchId: batch._id,
            frames: chunk,
          });
        }

        await ctx.runMutation(completeSnapshotImportForCallbackMutation, {
          batchId: batch._id,
          counts: importResult.counts,
          refinement: importResult.refinement,
          warnings: importResult.warnings,
        });

        const result = {
          batchId: importResult.batchId,
          counts: importResult.counts,
          refinement: importResult.refinement,
          warnings: importResult.warnings,
        };

        return jsonResponse(200, {
          ok: true,
          batchId: batch._id,
          status: 'completed',
          result,
        });
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message.slice(0, 500)
            : 'Failed to process parsed snapshot';

        await ctx.runMutation(updateBatchStatusForCallbackMutation, {
          batchId: batch._id,
          status: 'failed',
          completedAt: Date.now(),
          errorMessage: message,
        });

        return jsonResponse(500, {
          error: message,
        });
      }
    }

    const isTerminal =
      payload.stage === 'completed' || payload.stage === 'failed';

    await ctx.runMutation(updateBatchStatusForCallbackMutation, {
      batchId: batch._id,
      status: payload.stage,
      completedAt: isTerminal ? Date.now() : null,
      errorMessage:
        payload.stage === 'failed'
          ? (payload.errorMessage?.trim().slice(0, 500) ?? 'Import failed')
          : null,
    });

    return jsonResponse(200, {
      ok: true,
      batchId: batch._id,
      status: payload.stage,
    });
  }),
});

export default http;
