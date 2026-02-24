import { ConvexError } from 'convex/values';

import { completeImportBatch } from './import_batch_lifecycle';

import type { RefinementResult, RefinementWarning } from './import_types';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export type CanonicalFrameInsert = {
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
};

export async function getRequiredImportBatch(
  ctx: MutationCtx,
  batchId: Id<'importBatches'>
) {
  const batch = await ctx.db.get(batchId);

  if (!batch) {
    throw new ConvexError('Import batch not found');
  }

  return batch;
}

export async function persistCanonicalFramesForBatch(
  ctx: MutationCtx,
  batch: Doc<'importBatches'>,
  frames: CanonicalFrameInsert[]
) {
  if (batch.status !== 'importing') {
    throw new ConvexError('Import batch must be importing to persist frames');
  }

  for (const frame of frames) {
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
    inserted: frames.length,
  };
}

export async function completeSnapshotImportForBatch(
  ctx: MutationCtx,
  args: {
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
  }
) {
  await getRequiredImportBatch(ctx, args.batchId);

  await completeImportBatch(ctx, {
    batchId: args.batchId,
    counts: args.counts,
    refinement: args.refinement,
    warnings: args.warnings,
  });

  return args.batchId;
}
