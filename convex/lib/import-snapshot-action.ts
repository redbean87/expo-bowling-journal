import {
  createImportBatchForSnapshotMutationRef,
  deleteUserDocsChunkForImportMutationRef,
  importSqliteSnapshotAfterCleanupMutationRef,
  persistRawImportChunkForBatchMutationRef,
} from './import-function-refs';
import { chunkRows } from './import-raw-mirror';
import { clearUserImportDataInChunks } from './import-replace-all-cleanup';
import {
  DEFAULT_RAW_IMPORT_CHUNK_SIZE,
  DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE,
  type ImportResult,
  type SqliteSnapshotInput,
} from './import-types';

import type { Id } from '../_generated/dataModel';

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

  await clearUserImportDataInChunks(async (table) => {
    const result = (await runMutation(deleteUserDocsChunkForImportMutationRef, {
      userId,
      table,
      chunkSize: DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE,
    })) as { deleted: number };
    return result.deleted;
  });

  const batchId = (await runMutation(createImportBatchForSnapshotMutationRef, {
    userId,
    sourceFileName: args.sourceFileName,
    sourceHash: args.sourceHash,
  })) as Id<'importBatches'>;

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
      await runMutation(persistRawImportChunkForBatchMutationRef, {
        batchId,
        table,
        rows: chunk,
      });
    }
  }

  return runMutation(importSqliteSnapshotAfterCleanupMutationRef, {
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
