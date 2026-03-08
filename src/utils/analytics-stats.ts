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
};

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
    .map((s) => s.totalPins)
    .filter((p) => p > 0);
  const highSeries =
    seriesCandidates.length > 0 ? Math.max(...seriesCandidates) : null;

  const totalGames = sessions.reduce((sum, s) => sum + s.gameCount, 0);
  const totalPins = sessions.reduce((sum, s) => sum + s.totalPins, 0);
  const seasonAvg = totalGames > 0 ? totalPins / totalGames : null;

  const totalStrikes = sessions.reduce((sum, s) => sum + s.totalStrikes, 0);
  const totalSpares = sessions.reduce((sum, s) => sum + s.totalSpares, 0);
  const totalOpens = sessions.reduce((sum, s) => sum + s.totalOpens, 0);
  const totalFrames = totalStrikes + totalSpares + totalOpens;

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
  };
}
