import { useMemo } from 'react';

import type {
  SessionAggregate,
  PersonalRecords,
} from '@/utils/analytics-stats';

export type HomeAnalytics = {
  seasonAvg: number | null;
  strikeRate: number | null;
  spareRate: number | null;
  avgTrend: number | null;
  totalGames: number;
  totalFrames: number;
  lastSession: {
    date: string;
    scores: number[];
    avg: number;
  } | null;
  rolling4Avg: number | null;
  insight: HomeInsight;
};

export type HomeInsightType =
  | 'spare-conversion-weak'
  | 'momentum-positive'
  | 'momentum-negative'
  | 'fatigue-detected'
  | 'strikes-strong'
  | 'no-data';

export type HomeInsight = {
  type: HomeInsightType;
  title: string;
  message: string;
  actionable: boolean;
};

const SPARE_THRESHOLD = 0.35;
const MOMENTUM_THRESHOLD = 3;
const FATIGUE_THRESHOLD = 10;

function computeInsight(
  records: PersonalRecords,
  sessions: SessionAggregate[],
  rolling4Avg: number | null
): HomeInsight {
  // Priority 1: Spare conversion weakness (most actionable for improvement)
  if (records.spareRate !== null && records.spareRate < SPARE_THRESHOLD) {
    const sparePercent = Math.round(records.spareRate * 100);
    const potentialGain = Math.round(
      (SPARE_THRESHOLD - records.spareRate) * 30 * 10
    ); // Rough estimate: each 10% spare improvement = ~3 pins
    return {
      type: 'spare-conversion-weak',
      title: 'Focus Tonight',
      message: `Spare conversions are limiting your scores (${sparePercent}%). Improving this could add ~${potentialGain}-${potentialGain + 5} pins/game.`,
      actionable: true,
    };
  }

  // Priority 2: Fatigue detection (late games dropping)
  if (
    sessions.length > 0 &&
    rolling4Avg !== null &&
    records.seasonAvg !== null
  ) {
    const lastSession = sessions[sessions.length - 1];
    if (lastSession.gameScores.length >= 4) {
      const game1Avg = lastSession.gameScores[0];
      const game4Avg = lastSession.gameScores[3];
      if (game1Avg - game4Avg > FATIGUE_THRESHOLD) {
        return {
          type: 'fatigue-detected',
          title: 'Focus Tonight',
          message: `Late-game fatigue detected (-${game1Avg - game4Avg} pins from Game 1 to 4). Consider pacing adjustments.`,
          actionable: true,
        };
      }
    }
  }

  // Priority 3: Momentum (positive trend)
  if (records.avgTrend !== null && records.avgTrend > MOMENTUM_THRESHOLD) {
    return {
      type: 'momentum-positive',
      title: 'Momentum',
      message: `You're bowling +${Math.round(records.avgTrend)} pins above your average recently. Keep the rhythm going!`,
      actionable: false,
    };
  }

  // Priority 4: Momentum (negative trend - gentle warning)
  if (records.avgTrend !== null && records.avgTrend < -MOMENTUM_THRESHOLD) {
    return {
      type: 'momentum-negative',
      title: 'Trend Alert',
      message: `Recent sessions are -${Math.round(Math.abs(records.avgTrend))} pins below average. Focus on fundamentals tonight.`,
      actionable: true,
    };
  }

  // Priority 5: Strong strikes (fallback positive)
  if (records.strikeRate !== null && records.strikeRate > 0.45) {
    const strikePercent = Math.round(records.strikeRate * 100);
    return {
      type: 'strikes-strong',
      title: 'Strength',
      message: `Strike rate is strong at ${strikePercent}%. Keep attacking — consistency is key.`,
      actionable: false,
    };
  }

  // Fallback: No meaningful insight yet
  return {
    type: 'no-data',
    title: 'Track Tonight',
    message:
      "Complete tonight's session to see your stats and personalized insights.",
    actionable: false,
  };
}

function computeLastSession(
  sessions: SessionAggregate[]
): HomeAnalytics['lastSession'] {
  const sessionsWithGames = sessions.filter((s) => s.gameCount > 0);
  if (sessionsWithGames.length === 0) return null;

  const last = sessionsWithGames[sessionsWithGames.length - 1];
  const scores = last.gameScores;
  const avg =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return {
    date: last.date,
    scores,
    avg: Math.round(avg),
  };
}

function computeRolling4Avg(sessions: SessionAggregate[]): number | null {
  // Get last 4 games across all sessions
  const allGames: number[] = [];
  for (let i = sessions.length - 1; i >= 0 && allGames.length < 4; i--) {
    const session = sessions[i];
    // Add games in reverse order (most recent first)
    for (
      let j = session.gameScores.length - 1;
      j >= 0 && allGames.length < 4;
      j--
    ) {
      allGames.unshift(session.gameScores[j]);
    }
  }

  if (allGames.length < 4) return null;
  return Math.round(allGames.reduce((a, b) => a + b, 0) / 4);
}

export function useHomeAnalytics(
  sessions: SessionAggregate[],
  records: PersonalRecords | null
): HomeAnalytics {
  return useMemo(() => {
    if (!records || sessions.length === 0) {
      return {
        seasonAvg: null,
        strikeRate: null,
        spareRate: null,
        avgTrend: null,
        totalGames: 0,
        totalFrames: 0,
        lastSession: null,
        rolling4Avg: null,
        insight: {
          type: 'no-data',
          title: 'Welcome',
          message: 'Start bowling to see your stats and personalized insights.',
          actionable: false,
        },
      };
    }

    const totalFrames =
      records.totalStrikes + records.totalSpares + records.totalOpens;
    const rolling4Avg = computeRolling4Avg(sessions);
    const insight = computeInsight(records, sessions, rolling4Avg);

    return {
      seasonAvg: records.seasonAvg,
      strikeRate: records.strikeRate,
      spareRate: records.spareRate,
      avgTrend: records.avgTrend,
      totalGames: records.totalGames,
      totalFrames,
      lastSession: computeLastSession(sessions),
      rolling4Avg,
      insight,
    };
  }, [sessions, records]);
}
