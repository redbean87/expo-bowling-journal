import { useConvexAuth, useQuery } from 'convex/react';

import type { SessionAggregate } from '@/utils/analytics-stats';

import { convexJournalService, type LeagueId } from '@/services/journal';

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

export function useSpareConversionAnalytics(leagueId: LeagueId | null) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const spareConversion = useQuery(
    convexJournalService.listSpareConversionByPinMask,
    isAuthenticated && leagueId ? { leagueId } : 'skip'
  );

  return {
    spareConversion: (spareConversion ?? null) as SpareConversionData | null,
    isLoading:
      isAuthLoading ||
      (isAuthenticated && leagueId !== null && spareConversion === undefined),
  };
}
