export type SessionAggregate = {
  sessionId: string;
  date: string;
  weekNumber: number | null;
  gameCount: number;
  totalPins: number;
  highGame: number | null;
  totalStrikes: number;
  totalSpares: number;
  totalOpens: number;
  cleanGames: number;
  gameScores: number[];
};

export type PersonalRecords = {
  highGame: number | null;
  highSeries: number | null;
  totalGames: number;
  seasonAvg: number | null;
  totalStrikes: number;
  totalSpares: number;
  totalOpens: number;
  strikeRate: number | null;
  spareRate: number | null;
  cleanGames: number;
  // Positive = bowling above season average recently.
  // Compares weighted avg of last 3 sessions to season avg.
  // null when fewer than 4 sessions with games.
  avgTrend: number | null;
};

export function computeCumulativeAverage(
  values: (number | null)[]
): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(0, i + 1).filter((v): v is number => v !== null);
    return slice.length > 0
      ? slice.reduce((a, b) => a + b, 0) / slice.length
      : null;
  });
}

export function computeGamePositionAvgs(
  sessions: SessionAggregate[]
): { position: number; avg: number; count: number }[] {
  const totals: { sum: number; count: number }[] = [];

  for (const s of sessions) {
    for (let i = 0; i < s.gameScores.length; i++) {
      if (!totals[i]) totals[i] = { sum: 0, count: 0 };
      totals[i].sum += s.gameScores[i];
      totals[i].count += 1;
    }
  }

  return totals
    .map((t, i) => ({ position: i, avg: t.sum / t.count, count: t.count }))
    .filter((_, i) => totals[i]?.count > 0);
}

export function computePersonalRecords(
  sessions: SessionAggregate[]
): PersonalRecords {
  const sessionsWithGames = sessions.filter((s) => s.gameCount > 0);

  const highGameCandidates = sessionsWithGames
    .map((s) => s.highGame)
    .filter((g): g is number => g !== null && g > 0);
  const highGame =
    highGameCandidates.length > 0 ? Math.max(...highGameCandidates) : null;

  const seriesCandidates = sessionsWithGames
    .filter((s) => s.gameScores.length >= 3)
    .map((s) => s.gameScores[0] + s.gameScores[1] + s.gameScores[2]);
  const highSeries =
    seriesCandidates.length > 0 ? Math.max(...seriesCandidates) : null;

  const totalGames = sessions.reduce((sum, s) => sum + s.gameCount, 0);
  const totalPins = sessions.reduce((sum, s) => sum + s.totalPins, 0);
  const seasonAvg = totalGames > 0 ? totalPins / totalGames : null;

  const totalStrikes = sessions.reduce((sum, s) => sum + s.totalStrikes, 0);
  const totalSpares = sessions.reduce((sum, s) => sum + s.totalSpares, 0);
  const totalOpens = sessions.reduce((sum, s) => sum + s.totalOpens, 0);
  const totalFrames = totalStrikes + totalSpares + totalOpens;

  let avgTrend: number | null = null;
  if (sessionsWithGames.length >= 4) {
    const last3 = sessionsWithGames.slice(-3);
    const recentPins = last3.reduce((s, sess) => s + sess.totalPins, 0);
    const recentGames = last3.reduce((s, sess) => s + sess.gameCount, 0);
    const recentAvg = recentPins / recentGames;
    avgTrend = recentAvg - (seasonAvg ?? 0);
  }

  return {
    highGame,
    highSeries,
    totalGames,
    seasonAvg,
    totalStrikes,
    totalSpares,
    totalOpens,
    strikeRate: totalFrames > 0 ? totalStrikes / totalFrames : null,
    spareRate: totalFrames > 0 ? totalSpares / totalFrames : null,
    cleanGames: sessions.reduce((sum, s) => sum + s.cleanGames, 0),
    avgTrend,
  };
}
