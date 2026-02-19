import type { GameId, SessionId } from '@/services/journal';

type SessionDateRecord = {
  _id: SessionId;
  date: string;
};

type GameRecord = {
  _id: GameId;
};

export function formatIsoDateForToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function findSessionIdForDate(
  sessions: SessionDateRecord[],
  targetDate: string
): SessionId | null {
  for (const session of sessions) {
    if (session.date === targetDate) {
      return session._id;
    }
  }

  return null;
}

export function resolveGameEntryGameId(games: GameRecord[]): GameId | 'new' {
  const mostRecentGameId = games[0]?._id;

  return mostRecentGameId ?? 'new';
}

export function toOldestFirstGames<T>(games: T[]): T[] {
  return [...games].reverse();
}

export function formatGameSequenceLabel(position: number): string {
  return `Game ${String(position)}`;
}
