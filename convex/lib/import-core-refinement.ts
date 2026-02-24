import {
  normalizeBallSwitches,
  normalizeLaneContext,
  normalizeNullableInteger,
  normalizeOptionalText,
  type BallSwitchInput,
} from './import_refinement';

import type {
  GameRefinementInput,
  RefinementResult,
  RefinementWarning,
  SessionRefinementInput,
} from './import-types';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

function hasOwn(object: object, property: string) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

async function resolveBallName(
  ctx: MutationCtx,
  userId: Id<'users'>,
  ballId: Id<'balls'>
) {
  const ball = await ctx.db.get(ballId);

  if (!ball || ball.userId !== userId) {
    return null;
  }

  return ball.name;
}

export async function applyRefinement(
  ctx: MutationCtx,
  userId: Id<'users'>,
  args: {
    sessions: SessionRefinementInput[];
    games: GameRefinementInput[];
  }
): Promise<RefinementResult> {
  const warnings: RefinementWarning[] = [];
  let sessionsPatched = 0;
  let sessionsSkipped = 0;
  let gamesPatched = 0;
  let gamesSkipped = 0;

  for (const sessionInput of args.sessions) {
    const session = await ctx.db.get(sessionInput.sessionId);

    if (!session || session.userId !== userId) {
      sessionsSkipped += 1;
      warnings.push({
        recordType: 'session',
        recordId: String(sessionInput.sessionId),
        message: 'Session not found or not owned by current user',
      });
      continue;
    }

    const patch: Partial<Doc<'sessions'>> = {};
    const localWarnings: string[] = [];

    if (hasOwn(sessionInput, 'notes')) {
      patch.notes = normalizeOptionalText(sessionInput.notes);
    }

    if (hasOwn(sessionInput, 'laneContext')) {
      patch.laneContext =
        normalizeLaneContext(
          sessionInput.laneContext,
          localWarnings,
          `session ${sessionInput.sessionId}`
        ) ?? null;
    }

    for (const warning of localWarnings) {
      warnings.push({
        recordType: 'session',
        recordId: String(sessionInput.sessionId),
        message: warning,
      });
    }

    if (Object.keys(patch).length === 0) {
      sessionsSkipped += 1;
      continue;
    }

    await ctx.db.patch(sessionInput.sessionId, patch);
    sessionsPatched += 1;
  }

  for (const gameInput of args.games) {
    const game = await ctx.db.get(gameInput.gameId);

    if (!game || game.userId !== userId) {
      gamesSkipped += 1;
      warnings.push({
        recordType: 'game',
        recordId: String(gameInput.gameId),
        message: 'Game not found or not owned by current user',
      });
      continue;
    }

    const patch: Partial<Doc<'games'>> = {};
    const localWarnings: string[] = [];

    if (hasOwn(gameInput, 'handicap')) {
      const normalizedHandicap = normalizeNullableInteger(
        gameInput.handicap,
        -200,
        200
      );

      if (gameInput.handicap !== undefined && normalizedHandicap === null) {
        localWarnings.push('handicap must be an integer between -200 and 200');
      }

      patch.handicap = normalizedHandicap;
    }

    if (hasOwn(gameInput, 'notes')) {
      patch.notes = normalizeOptionalText(gameInput.notes);
    }

    if (hasOwn(gameInput, 'laneContext')) {
      patch.laneContext =
        normalizeLaneContext(
          gameInput.laneContext,
          localWarnings,
          `game ${gameInput.gameId}`
        ) ?? null;
    }

    if (hasOwn(gameInput, 'ballSwitches')) {
      const normalizedSwitches = normalizeBallSwitches(
        gameInput.ballSwitches,
        localWarnings,
        `game ${gameInput.gameId}`
      );

      if (normalizedSwitches === null) {
        patch.ballSwitches = null;
      } else {
        const verifiedSwitches: BallSwitchInput[] = [];

        for (const ballSwitch of normalizedSwitches) {
          if (!ballSwitch.ballId) {
            verifiedSwitches.push(ballSwitch);
            continue;
          }

          const ballName = await resolveBallName(
            ctx,
            userId,
            ballSwitch.ballId
          );

          if (!ballName) {
            localWarnings.push(
              `game ${gameInput.gameId}: ball ${ballSwitch.ballId} is missing or unauthorized`
            );
            verifiedSwitches.push({
              ...ballSwitch,
              ballId: null,
              ballName: ballSwitch.ballName ?? null,
            });
            continue;
          }

          verifiedSwitches.push({
            ...ballSwitch,
            ballName: ballSwitch.ballName ?? ballName,
          });
        }

        patch.ballSwitches = verifiedSwitches;
      }
    }

    for (const warning of localWarnings) {
      warnings.push({
        recordType: 'game',
        recordId: String(gameInput.gameId),
        message: warning,
      });
    }

    if (Object.keys(patch).length === 0) {
      gamesSkipped += 1;
      continue;
    }

    await ctx.db.patch(gameInput.gameId, patch);
    gamesPatched += 1;
  }

  return {
    sessionsProcessed: args.sessions.length,
    sessionsPatched,
    sessionsSkipped,
    gamesProcessed: args.games.length,
    gamesPatched,
    gamesSkipped,
    warnings,
  };
}
