import { v } from 'convex/values';

import { internalMutation, mutation } from './_generated/server';
import { requireUserId } from './lib/auth';

/**
 * Derives isOpen from a stored framePreview text field.
 *
 * Text inspection mirrors the logic in getFrameIsOpen / summarizePreviewMarks:
 * - Empty or gutter-only ("-") frames are not open
 * - Any frame containing a strike (X) or spare (/) is not open
 * - Two or more roll symbols with no X or / means an open frame
 */
function isOpenFromText(text: string): boolean {
  const compact = text.replace(/\s+/g, '');

  if (compact === '' || compact === '-') {
    return false;
  }

  if (compact.includes('X') || compact.includes('/')) {
    return false;
  }

  return compact.length >= 2;
}

function normalizePageSize(pageSize: number | undefined): number {
  if (pageSize !== undefined && Number.isInteger(pageSize) && pageSize > 0) {
    return Math.min(pageSize, 200);
  }

  return 100;
}

/**
 * Backfills `isOpen` onto existing stored `framePreview` items for the
 * authenticated user.
 *
 * Run with `{ "dryRun": true }` first to verify the candidate count, then
 * without dryRun to apply. Paginate by passing `{ "cursor": continueCursor }`
 * until `hasMore` is false.
 *
 * CLI: npx convex run backfills:backfillFramePreviewIsOpen '{}'
 */
export const backfillFramePreviewIsOpen = mutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const pageSize = normalizePageSize(args.pageSize);
    const dryRun = args.dryRun ?? false;

    const page = await ctx.db
      .query('games')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .paginate({
        numItems: pageSize,
        cursor: args.cursor ?? null,
      });

    let patched = 0;
    let skipped = 0;

    for (const game of page.page) {
      const preview = game.framePreview;

      if (!Array.isArray(preview) || preview.length === 0) {
        skipped += 1;
        continue;
      }

      const needsPatch = preview.some(
        (item) => !('isOpen' in item) || item.isOpen === undefined
      );

      if (!needsPatch) {
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        const patchedPreview = preview.map((item) => ({
          ...item,
          isOpen:
            'isOpen' in item && item.isOpen !== undefined
              ? Boolean(item.isOpen)
              : isOpenFromText(String(item.text ?? '')),
        }));

        await ctx.db.patch(game._id, { framePreview: patchedPreview });
      }

      patched += 1;
    }

    return {
      scanned: page.page.length,
      patched,
      skipped,
      hasMore: !page.isDone,
      continueCursor: page.continueCursor,
      dryRun,
    };
  },
});

/**
 * Internal (full-table) twin of `backfillFramePreviewIsOpen`.
 *
 * Requires the `confirm` literal to prevent accidental execution.
 * Run from the Convex dashboard or CLI (no auth required).
 *
 * CLI: npx convex run backfills:backfillFramePreviewIsOpenInternal \
 *        '{"confirm":"backfill-frame-preview-is-open","dryRun":true}'
 */
export const backfillFramePreviewIsOpenInternal = internalMutation({
  args: {
    confirm: v.literal('backfill-frame-preview-is-open'),
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const pageSize = normalizePageSize(args.pageSize);
    const dryRun = args.dryRun ?? false;

    const page = await ctx.db.query('games').paginate({
      numItems: pageSize,
      cursor: args.cursor ?? null,
    });

    let patched = 0;
    let skipped = 0;

    for (const game of page.page) {
      const preview = game.framePreview;

      if (!Array.isArray(preview) || preview.length === 0) {
        skipped += 1;
        continue;
      }

      const needsPatch = preview.some(
        (item) => !('isOpen' in item) || item.isOpen === undefined
      );

      if (!needsPatch) {
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        const patchedPreview = preview.map((item) => ({
          ...item,
          isOpen:
            'isOpen' in item && item.isOpen !== undefined
              ? Boolean(item.isOpen)
              : isOpenFromText(String(item.text ?? '')),
        }));

        await ctx.db.patch(game._id, { framePreview: patchedPreview });
      }

      patched += 1;
    }

    return {
      scanned: page.page.length,
      patched,
      skipped,
      hasMore: !page.isDone,
      continueCursor: page.continueCursor,
      dryRun,
      confirmed: args.confirm,
    };
  },
});
