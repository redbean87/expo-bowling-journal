import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export type ReferenceUsageType = 'ball' | 'pattern' | 'house';

type ReferenceUsageCtx = MutationCtx | QueryCtx;

export async function touchReferenceUsage(
  ctx: MutationCtx,
  args: {
    userId: Id<'users'>;
    referenceType: ReferenceUsageType;
    referenceId: string;
    usedAt?: number;
  }
) {
  const usedAt = args.usedAt ?? Date.now();
  const existing = await ctx.db
    .query('referenceUsage')
    .withIndex('by_user_type_ref', (q) =>
      q
        .eq('userId', args.userId)
        .eq('referenceType', args.referenceType)
        .eq('referenceId', args.referenceId)
    )
    .first();

  if (!existing) {
    await ctx.db.insert('referenceUsage', {
      userId: args.userId,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      lastUsedAt: usedAt,
    });
    return;
  }

  if (usedAt > existing.lastUsedAt) {
    await ctx.db.patch(existing._id, { lastUsedAt: usedAt });
  }
}

export async function listRecentReferenceIds(
  ctx: ReferenceUsageCtx,
  args: {
    userId: Id<'users'>;
    referenceType: ReferenceUsageType;
    limit: number;
  }
) {
  if (args.limit <= 0) {
    return [] as string[];
  }

  const rows = await ctx.db
    .query('referenceUsage')
    .withIndex('by_user_type_last_used', (q) =>
      q.eq('userId', args.userId).eq('referenceType', args.referenceType)
    )
    .order('desc')
    .take(args.limit * 3);

  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.referenceId)) {
      continue;
    }

    seen.add(row.referenceId);
    deduped.push(row.referenceId);

    if (deduped.length >= args.limit) {
      break;
    }
  }

  return deduped;
}
