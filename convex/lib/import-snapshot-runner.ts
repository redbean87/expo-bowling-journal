import {
  completeImportBatch,
  toPublicImportResult,
} from './import-batch-lifecycle';
import { getRequiredImportBatch } from './import-callback-helpers';
import { applyRefinement } from './import-core-refinement';
import { runSqliteSnapshotImportCore } from './import-core-runner';
import { parseSnapshotJsonPayload } from './import_snapshot';

import type { ImportResult, SqliteSnapshotInput } from './import-types';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export async function runSqliteSnapshotImportAndComplete(
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

export async function submitParsedSnapshotForCallbackCore(
  ctx: MutationCtx,
  args: {
    batchId: Id<'importBatches'>;
    skipReplaceAllCleanup?: boolean;
    skipRawMirrorPersistence?: boolean;
    timezoneOffsetMinutes?: number | null;
    snapshot: SqliteSnapshotInput;
  }
) {
  const batch = await getRequiredImportBatch(ctx, args.batchId);

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
}

export async function submitParsedSnapshotJsonForCallbackCore(
  ctx: MutationCtx,
  args: {
    batchId: Id<'importBatches'>;
    skipReplaceAllCleanup?: boolean;
    skipRawMirrorPersistence?: boolean;
    timezoneOffsetMinutes?: number | null;
    snapshotJson: string;
  }
) {
  const snapshot = parseSnapshotJsonPayload<SqliteSnapshotInput>(
    args.snapshotJson
  );

  return submitParsedSnapshotForCallbackCore(ctx, {
    batchId: args.batchId,
    skipReplaceAllCleanup: args.skipReplaceAllCleanup,
    skipRawMirrorPersistence: args.skipRawMirrorPersistence,
    timezoneOffsetMinutes: args.timezoneOffsetMinutes,
    snapshot,
  });
}

export type ImportSqliteSnapshotAfterCleanupArgs = {
  userId: Id<'users'>;
  batchId?: Id<'importBatches'> | null;
  skipRawMirrorPersistence?: boolean;
} & SqliteSnapshotInput;

export async function importSqliteSnapshotAfterCleanupCore(
  ctx: MutationCtx,
  args: ImportSqliteSnapshotAfterCleanupArgs
): Promise<ImportResult> {
  const { userId, batchId, skipRawMirrorPersistence, ...snapshotArgs } = args;

  return runSqliteSnapshotImportAndComplete(
    ctx,
    userId,
    snapshotArgs,
    batchId ?? undefined,
    {
      skipReplaceAllCleanup: true,
      skipRawMirrorPersistence: skipRawMirrorPersistence ?? false,
    }
  );
}
