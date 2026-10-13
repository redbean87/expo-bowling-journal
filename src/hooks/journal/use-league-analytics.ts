import { useEffect, useState } from 'react';

import {
  FULL_PIN_MASK,
  getRollValue,
} from '@/screens/game-editor/frame-mask-utils';
import { type LeagueId } from '@/services/journal';
import { getLocalJournalService } from '@/services/local-journal';
import { type SessionAggregate } from '@/utils/analytics-stats';

export type { SessionAggregate };

export type SpareConversionData = {
  byPinCount: Array<{
    pinCount: number;
    attempts: number;
    converted: number;
    conversionRate: number;
  }>;
  byPinMask: Array<{
    pinMask: number;
    pinCount: number;
    attempts: number;
    converted: number;
    conversionRate: number;
  }>;
  totalSpareAttempts: number;
  totalSparesConverted: number;
};

type SpareAttemptFrame = {
  roll1: number;
  roll2: number | null;
  pinsMask: number;
};

/**
 * Standing-pin mask after roll 1, from the local frame's roll-1 mask.
 *
 * Mirrors the server's `getStandingPinsAfterRoll1` packed branch: the mask
 * holds the pins that were *not* down, so the standing pins are the
 * complement within the full ten-pin mask. Frames without roll 1 entered
 * contribute no standing pins (0).
 */
function standingPinsAfterRoll1(roll1Mask: number | null): number {
  return roll1Mask === null ? 0 : FULL_PIN_MASK & ~roll1Mask;
}

/**
 * Pins knocked in the frame's roll 1, derived from the stored mask using the
 * same mask-to-roll derivation the scoring engine uses (bit count).
 * Matches the server frame's client-computed roll values.
 */
function roll1FromMask(roll1Mask: number | null): number {
  return getRollValue(roll1Mask) ?? 0;
}

async function collectLocalSpareAttempts(
  leagueId: LeagueId
): Promise<SpareAttemptFrame[]> {
  const service = getLocalJournalService();
  const games = await service.listGames({ leagueId });
  const attempts: SpareAttemptFrame[] = [];

  for (const game of games) {
    const frames = await service.getGameFrames(game.id);

    for (const frame of frames) {
      if (frame.frameNumber > 9) {
        continue;
      }

      const roll1Mask = frame.roll1Mask ?? null;
      const roll1 = roll1FromMask(roll1Mask);

      // Frames where roll 1 was not a strike are spare attempts; a missing
      // roll 1 counts as zero pins (same as the server row).
      if (roll1 < 10) {
        attempts.push({
          roll1,
          roll2: getRollValue(frame.roll2Mask ?? null),
          pinsMask: standingPinsAfterRoll1(roll1Mask),
        });
      }
    }
  }

  return attempts;
}

export function useSpareConversionAnalytics(leagueId: LeagueId | null) {
  const [spareConversion, setSpareConversion] =
    useState<SpareConversionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Local SQLite is the authoritative spare-conversion read: always loaded
  // (when a league is selected), no Convex query, no cloud cache, no auth
  // gate. Roll values come from the stored pin masks via the same
  // mask-to-roll derivation the scoring engine uses.
  useEffect(() => {
    if (!leagueId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadSpareConversion = async () => {
      try {
        const spareAttempts = await collectLocalSpareAttempts(leagueId);

        const byPinCount: Map<number, { attempts: number; converted: number }> =
          new Map();

        const byPinMask: Map<
          number,
          { attempts: number; converted: number; pinCount: number }
        > = new Map();

        for (const frame of spareAttempts) {
          // Pins left standing after roll 1, and how many of them.
          const pinCount = getRollValue(frame.pinsMask) ?? 0;
          // Spare conversion: either (a) sum is >= 10 (picked up all
          // standing pins), or (b) roll2 is 0 but we cleared all pins
          // (rare edge case for multi-pin leaves).
          const converted =
            frame.roll2 !== null &&
            (frame.roll1 + frame.roll2 >= 10 ||
              (frame.roll2 === 0 && frame.pinsMask === 0));

          const countStats = byPinCount.get(pinCount) ?? {
            attempts: 0,
            converted: 0,
          };
          countStats.attempts += 1;
          if (converted) countStats.converted += 1;
          byPinCount.set(pinCount, countStats);

          const maskStats = byPinMask.get(frame.pinsMask) ?? {
            attempts: 0,
            converted: 0,
            pinCount,
          };
          maskStats.attempts += 1;
          if (converted) maskStats.converted += 1;
          byPinMask.set(frame.pinsMask, maskStats);
        }

        const pinCountResults = Array.from(byPinCount.entries())
          .filter(([count]) => count >= 1 && count <= 9)
          .map(([pinCount, stats]) => ({
            pinCount,
            attempts: stats.attempts,
            converted: stats.converted,
            conversionRate:
              stats.attempts > 0 ? stats.converted / stats.attempts : 0,
          }))
          .sort((a, b) => b.pinCount - a.pinCount);

        const pinMaskResults = Array.from(byPinMask.entries())
          .filter(([, stats]) => stats.attempts >= 3)
          .map(([pinMask, stats]) => ({
            pinMask,
            pinCount: stats.pinCount,
            attempts: stats.attempts,
            converted: stats.converted,
            conversionRate:
              stats.attempts > 0 ? stats.converted / stats.attempts : 0,
          }))
          .sort((a, b) => b.attempts - a.attempts)
          .slice(0, 20);

        const result: SpareConversionData = {
          byPinCount: pinCountResults,
          byPinMask: pinMaskResults,
          totalSpareAttempts: spareAttempts.length,
          totalSparesConverted: spareAttempts.filter(
            (f) => f.roll2 !== null && f.roll1 + f.roll2 >= 10
          ).length,
        };

        if (isMounted) {
          setSpareConversion(result);
        }
      } catch {
        if (isMounted) {
          setSpareConversion(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadSpareConversion();

    return () => {
      isMounted = false;
    };
  }, [leagueId]);

  return {
    spareConversion,
    isLoading: leagueId !== null && isLoading,
  };
}

export function useLeagueAnalytics(leagueId: LeagueId | null) {
  const [sessionAggregates, setSessionAggregates] = useState<
    SessionAggregate[] | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);

  // Local SQLite is the authoritative session-aggregate read: always loaded
  // (when a league is selected), no Convex query, no cloud cache, no auth
  // gate. Per-game scores and strike/spare/open counts come from the local
  // scoring derivation (C5), the same provisional stats the server
  // persisted on every frame write.
  useEffect(() => {
    if (!leagueId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadSessionAggregates = async () => {
      try {
        const service = getLocalJournalService();
        const sessions = await service.listSessions({ leagueId });

        const aggregates: SessionAggregate[] = [];

        for (const session of sessions) {
          const games = await service.listGames({ sessionId: session.id });

          const gameScores: number[] = [];
          let totalStrikes = 0;
          let totalSpares = 0;
          let totalOpens = 0;
          let cleanGames = 0;

          for (const game of games) {
            const score = await service.getGameScore(game.id);
            const totalScore = score === null ? null : score.totalScore;

            if (totalScore !== null && totalScore > 0) {
              gameScores.push(totalScore);
            }

            totalStrikes += score?.strikes ?? 0;
            totalSpares += score?.spares ?? 0;
            totalOpens += score?.opens ?? 0;

            if (
              (score?.opens ?? 0) === 0 &&
              totalScore !== null &&
              totalScore > 0
            ) {
              cleanGames += 1;
            }
          }

          aggregates.push({
            sessionId: session.id,
            date: session.date,
            weekNumber: session.weekNumber ?? null,
            gameCount: gameScores.length,
            totalPins: gameScores.reduce((a, b) => a + b, 0),
            highGame: gameScores.length > 0 ? Math.max(...gameScores) : null,
            totalStrikes,
            totalSpares,
            totalOpens,
            cleanGames,
            gameScores,
          });
        }

        if (isMounted) {
          setSessionAggregates(aggregates);
        }
      } catch {
        if (isMounted) {
          setSessionAggregates([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadSessionAggregates();

    return () => {
      isMounted = false;
    };
  }, [leagueId]);

  return {
    sessionAggregates: sessionAggregates ?? [],
    isLoading: leagueId !== null && isLoading,
  };
}
