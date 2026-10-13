import { useEffect, useState } from 'react';

import { type LeagueGameStat, type LeagueId } from '@/services/journal';
import {
  listLocalGamesBySession,
  listLocalSessionsByLeague,
} from '@/services/journal/local-reads';

export function useLeagueGames(leagueId: LeagueId | null) {
  const [localGames, setLocalGames] = useState<LeagueGameStat[] | null>(null);
  const [isLocalGamesLoading, setIsLocalGamesLoading] = useState(true);

  // Local SQLite is the authoritative league-games read: always loaded (when
  // a league is selected), no Convex query, no cloud cache, no auth gate.
  // Games are reached through the league's sessions, the same existing
  // local-reads path the other journal hooks use.
  useEffect(() => {
    if (!leagueId) {
      setIsLocalGamesLoading(false);
      return;
    }

    let isMounted = true;

    const loadLocalLeagueGames = async () => {
      try {
        const sessions = await listLocalSessionsByLeague(leagueId);
        const gamesBySession = await Promise.all(
          sessions.map((session) => listLocalGamesBySession(session._id))
        );

        const stats: LeagueGameStat[] = gamesBySession.flat().map((game) => {
          return {
            _id: game._id,
            sessionId: game.sessionId,
            totalScore: game.totalScore,
            strikes: game.strikes,
            spares: game.spares,
            opens: game.opens,
          };
        });

        if (isMounted) {
          setLocalGames(stats);
        }
      } catch {
        if (isMounted) {
          setLocalGames([]);
        }
      } finally {
        if (isMounted) {
          setIsLocalGamesLoading(false);
        }
      }
    };

    void loadLocalLeagueGames();

    return () => {
      isMounted = false;
    };
  }, [leagueId]);

  return {
    games: localGames ?? [],
    isLoading: leagueId !== null && isLocalGamesLoading,
  };
}
