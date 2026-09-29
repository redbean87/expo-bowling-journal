/**
 * Derived game scoring (C5).
 *
 * Pure, deterministic scoring of a game from its authoritative frame masks.
 * No database access and no mutation: the input frames are only read.
 *
 * The scoring algorithm delegates to the existing authoritative
 * implementation in `src/screens/game-editor/frame-scoring.ts`
 * (`getSettledRunningTotals` / `getProvisionalTotalScore`), which
 * `docs/domain-model.md` documents as the source of truth for scoring
 * behavior (strike bonus = next two rolls, spare bonus = next roll,
 * tenth frame sums its own rolls). The strike/spare/open classification
 * counts follow the existing canonical behavior of the Convex
 * `computeGameStats` implementation: only frames complete enough to be
 * classified are counted (partial and unstarted frames are not).
 *
 * The derived result is never persisted.
 */
import {
  EMPTY_FRAMES,
  getRollValue,
  type FrameDraft,
} from '../../screens/game-editor/frame-mask-utils';
import {
  getProvisionalTotalScore,
  getSettledRunningTotals,
} from '../../screens/game-editor/frame-scoring';

import type { Frame, GameScore } from './types';

/**
 * Map a game's canonical frames onto the ten-slot draft layout used by the
 * authoritative scorer (slot `i` is frame `i + 1`). Frames missing from the
 * game — or with a `frameNumber` outside 1..10 — leave their slot empty
 * (unstarted), matching the authoritative scorer's handling of unstarted
 * frames.
 */
function framesToFrameDrafts(frames: Frame[]): FrameDraft[] {
  const drafts = EMPTY_FRAMES.map((draft) => ({ ...draft }));

  for (const frame of frames) {
    const index = frame.frameNumber - 1;

    if (index < 0 || index >= drafts.length) {
      continue;
    }

    drafts[index] = {
      roll1Mask: frame.roll1Mask ?? null,
      roll2Mask: frame.roll2Mask ?? null,
      roll3Mask: frame.roll3Mask ?? null,
    };
  }

  return drafts;
}

/**
 * Compute the derived score for a game's frames.
 *
 * - `totalScore`: provisional total (points earned so far, including
 *   partial-frame points); equals the final score when the game is
 *   complete.
 * - `settledRunningTotals`: per-frame cumulative scores; `null` for frames
 *   that are not yet settled.
 * - `frameScores`: per-frame own scores (including earned bonuses); `null`
 *   for frames that are not yet settled.
 * - `strikes`/`spares`/`opens`: frame classification counts.
 * - `isComplete`: true when all ten frames are settled.
 */
export function scoreGameFrames(frames: Frame[]): GameScore {
  const drafts = framesToFrameDrafts(frames);
  const settledRunningTotals = getSettledRunningTotals(drafts);
  const totalScore = getProvisionalTotalScore(drafts);

  // Per-frame own scores are the deltas of the settled running totals. A
  // frame's settled status depends on its own rolls and, for strikes/spares,
  // the *following* rolls — not on earlier frames — so a settled frame can
  // directly follow an unsettled one (e.g. a partial frame with rolls
  // entered but the game still in progress). The delta of a settled frame is
  // therefore taken against the nearest earlier settled running total (or
  // 0 when none exists), which equals the sum of the settled frames' own
  // points preceding it.
  const frameScores: Array<number | null> = settledRunningTotals.map(
    (total, index) => {
      if (total === null) {
        return null;
      }

      let previous = 0;
      for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
        const earlierTotal = settledRunningTotals[earlier];
        if (earlierTotal !== null) {
          previous = earlierTotal;
          break;
        }
      }

      return total - previous;
    }
  );

  let strikes = 0;
  let spares = 0;
  let opens = 0;

  for (const frame of frames) {
    const index = frame.frameNumber - 1;
    if (index < 0 || index > 9) {
      continue;
    }

    const roll1 = getRollValue(frame.roll1Mask ?? null);
    const roll2 = getRollValue(frame.roll2Mask ?? null);
    if (roll1 === null) {
      continue;
    }

    if (roll1 === 10) {
      strikes += 1;
      continue;
    }

    if (roll2 === null) {
      continue;
    }

    const frameTotal = roll1 + roll2;
    if (frameTotal === 10) {
      spares += 1;
    } else if (frameTotal < 10) {
      opens += 1;
    }
  }

  return {
    isComplete: settledRunningTotals.every((total) => total !== null),
    totalScore,
    settledRunningTotals,
    frameScores,
    strikes,
    spares,
    opens,
  };
}
