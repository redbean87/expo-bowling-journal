import { makeFunctionReference } from 'convex/server';

import { chunkRows } from './import-raw-mirror';
import { clearUserImportDataInChunks } from './import-replace-all-cleanup';
import {
  DEFAULT_RAW_IMPORT_CHUNK_SIZE,
  DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE,
  type ImportResult,
  type RawImportTable,
  type ReplaceAllCleanupTable,
  type SqliteSnapshotInput,
} from './import-types';

import type { Doc, Id } from '../_generated/dataModel';

type SnapshotActionCtx = {
  runMutation: unknown;
};

export async function runImportSqliteSnapshotAction(
  ctx: SnapshotActionCtx,
  userId: Id<'users'>,
  args: SqliteSnapshotInput
) {
  const runMutation = ctx.runMutation as (
    mutationRef: unknown,
    args: unknown
  ) => Promise<unknown>;

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
    const result = (await runMutation(deleteUserDocsChunkForImportMutation, {
      userId,
      table,
      chunkSize: DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE,
    })) as { deleted: number };
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

  const batchId = (await runMutation(createImportBatchForSnapshotMutation, {
    userId,
    sourceFileName: args.sourceFileName,
    sourceHash: args.sourceHash,
  })) as Id<'importBatches'>;

  const persistRawImportChunkForBatchMutation = makeFunctionReference<
    'mutation',
    {
      batchId: Id<'importBatches'>;
      table: RawImportTable;
      rows: unknown[];
    },
    { inserted: number }
  >('imports:persistRawImportChunkForBatch');

  for (const [table, rows] of [
    ['importRawHouses', args.houses],
    ['importRawPatterns', args.patterns],
    ['importRawBalls', args.balls],
    ['importRawLeagues', args.leagues],
    ['importRawWeeks', args.weeks],
    ['importRawGames', args.games],
    ['importRawFrames', args.frames],
  ] as const) {
    const chunks = chunkRows(rows, DEFAULT_RAW_IMPORT_CHUNK_SIZE);

    for (const chunk of chunks) {
      await runMutation(persistRawImportChunkForBatchMutation, {
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

  return runMutation(importSqliteSnapshotAfterCleanupMutation, {
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
  }) as Promise<ImportResult>;
}
