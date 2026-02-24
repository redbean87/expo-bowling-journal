import type {
  ImportResult,
  RefinementResult,
  RefinementWarning,
  SnapshotImportCoreResult,
} from './import_types';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export function toPublicImportResult(
  result: SnapshotImportCoreResult
): ImportResult {
  return {
    batchId: result.batchId,
    counts: result.counts,
    refinement: result.refinement,
    warnings: result.warnings,
  };
}

export async function completeImportBatch(
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
