import type { Game } from '@/services/journal';

export type SessionNightSummary = {
  gamesPlayed: number;
  targetGames: number | null;
  remainingGames: number | null;
  isNightComplete: boolean;
  totalPins: number;
  average: number;
  highGame: number | null;
  lowGame: number | null;
  strikes: number;
  spares: number;
  opens: number;
};

export function normalizeGamesPerSession(
  gamesPerSession: number | null | undefined
): number | null {
  if (gamesPerSession === undefined || gamesPerSession === null) {
    return null;
  }

  if (!Number.isInteger(gamesPerSession) || gamesPerSession < 1) {
    return null;
  }

  return gamesPerSession;
}

export function buildSessionNightSummary(
  games: Game[],
  gamesPerSession: number | null | undefined
): SessionNightSummary {
  const gamesPlayed = games.length;
  const targetGames = normalizeGamesPerSession(gamesPerSession);
  const totalPins = games.reduce((total, game) => total + game.totalScore, 0);
  const strikes = games.reduce((total, game) => total + game.strikes, 0);
  const spares = games.reduce((total, game) => total + game.spares, 0);
  const opens = games.reduce((total, game) => total + game.opens, 0);

  let highGame: number | null = null;
  let lowGame: number | null = null;

  for (const game of games) {
    if (highGame === null || game.totalScore > highGame) {
      highGame = game.totalScore;
    }

    if (lowGame === null || game.totalScore < lowGame) {
      lowGame = game.totalScore;
    }
  }

  const isNightComplete = targetGames !== null && gamesPlayed >= targetGames;
  const remainingGames =
    targetGames === null ? null : Math.max(targetGames - gamesPlayed, 0);

  return {
    gamesPlayed,
    targetGames,
    remainingGames,
    isNightComplete,
    totalPins,
    average: gamesPlayed === 0 ? 0 : totalPins / gamesPlayed,
    highGame,
    lowGame,
    strikes,
    spares,
    opens,
  };
}
