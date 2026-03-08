import { useConvexAuth, useQuery } from 'convex/react';

import type { SessionAggregate } from '@/utils/analytics-stats';

import { convexJournalService, type LeagueId } from '@/services/journal';

export type { SessionAggregate };

export function useLeagueAnalytics(leagueId: LeagueId | null) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const sessionAggregates = useQuery(
    convexJournalService.listSessionAggregates,
    isAuthenticated && leagueId ? { leagueId } : 'skip'
  );

  return {
    sessionAggregates: (sessionAggregates ?? []) as SessionAggregate[],
    isLoading:
      isAuthLoading ||
      (isAuthenticated && leagueId !== null && sessionAggregates === undefined),
  };
}
