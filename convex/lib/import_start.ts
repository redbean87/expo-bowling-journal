import { ConvexError } from 'convex/values';

import { normalizeOptionalText } from './import_refinement';
import { EMPTY_IMPORT_COUNTS } from './import_types';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

type StartImportArgs = {
  userId: Id<'users'>;
  r2Key: string;
  fileName?: string | null;
  fileSize: number;
  checksum?: string | null;
  idempotencyKey: string;
  timezoneOffsetMinutes: number | null;
};

type StartImportDeps = {
  scheduleDispatch: (args: {
    batchId: Id<'importBatches'>;
    userId: Id<'users'>;
    r2Key: string;
    timezoneOffsetMinutes: number | null;
  }) => Promise<void>;
};

export function validateImportR2KeyOwnership(
  userId: Id<'users'>,
  r2Key: string
) {
  const expectedPrefix = `imports/${String(userId)}/`;

  if (!r2Key.startsWith(expectedPrefix)) {
    throw new ConvexError('r2Key must be scoped to the authenticated user');
  }
}

export async function startImportBatch(
  ctx: MutationCtx,
  args: StartImportArgs,
  deps: StartImportDeps
) {
  if (!Number.isFinite(args.fileSize) || args.fileSize <= 0) {
    throw new ConvexError('fileSize must be a positive number');
  }

  const idempotencyKey = args.idempotencyKey.trim();

  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new ConvexError('idempotencyKey must be 8-128 characters');
  }

  validateImportR2KeyOwnership(args.userId, args.r2Key);

  const existingBatch = await ctx.db
    .query('importBatches')
    .withIndex('by_user_idempotency', (q) =>
      q.eq('userId', args.userId).eq('idempotencyKey', idempotencyKey)
    )
    .first();

  if (existingBatch) {
    return {
      batchId: existingBatch._id,
      deduplicated: true,
    };
  }

  const batchId = await ctx.db.insert('importBatches', {
    userId: args.userId,
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

  await deps.scheduleDispatch({
    batchId,
    userId: args.userId,
    r2Key: args.r2Key,
    timezoneOffsetMinutes: args.timezoneOffsetMinutes,
  });

  return {
    batchId,
    deduplicated: false,
  };
}
