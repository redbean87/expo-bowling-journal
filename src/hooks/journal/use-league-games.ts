import { useConvexAuth, useQuery } from 'convex/react';

import { convexJournalService, type LeagueId } from '@/services/journal';

export function useLeagueGames(leagueId: LeagueId | null) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const games = useQuery(
    convexJournalService.listGameStatsByLeague,
    isAuthenticated && leagueId ? { leagueId } : 'skip'
  );

  return {
    games: games ?? [],
    isLoading:
      isAuthLoading ||
      (isAuthenticated && leagueId !== null && games === undefined),
  };
}
