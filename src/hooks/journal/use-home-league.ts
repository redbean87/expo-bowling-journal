import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { convexJournalService } from '@/services/journal';

const HOME_LEAGUE_STORAGE_KEY = '@bowling-journal:home-league-id';

function getThreeMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

type DisplayLeague = {
  _id: string;
  name: string;
  houseName: string | null;
  gamesPerSession: number | null;
  mostRecentSessionDate: string | null;
};

export function useHomeLeague() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const cutoffDate = getThreeMonthsAgo();

  const leaguesQuery = useQuery(
    convexJournalService.listLeagues,
    isAuthenticated ? { cutoffDate } : 'skip'
  );

  const leagues = useMemo(() => leaguesQuery ?? [], [leaguesQuery]);
  const isLoading =
    isAuthLoading || (isAuthenticated && leaguesQuery === undefined);

  const [savedHomeLeagueId, setSavedHomeLeagueId] = useState<string | null>(
    null
  );
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(HOME_LEAGUE_STORAGE_KEY).then((value) => {
      setSavedHomeLeagueId(value);
      setIsHydrated(true);
    });
  }, []);

  const setHomeLeague = useCallback(async (leagueId: string) => {
    await AsyncStorage.setItem(HOME_LEAGUE_STORAGE_KEY, leagueId);
    setSavedHomeLeagueId(leagueId);
  }, []);

  const displayLeagues = useMemo((): DisplayLeague[] => {
    return leagues.map((league) => ({
      _id: league._id,
      name: league.name,
      houseName: league.houseName ?? null,
      gamesPerSession: league.gamesPerSession ?? null,
      mostRecentSessionDate: league.mostRecentSessionDate ?? null,
    }));
  }, [leagues]);

  const activeLeague = useMemo(() => {
    if (!isHydrated) return null;

    if (savedHomeLeagueId) {
      const byId = displayLeagues.find((l) => l._id === savedHomeLeagueId);
      if (byId) return byId;
    }

    return displayLeagues[0] ?? null;
  }, [displayLeagues, savedHomeLeagueId, isHydrated]);

  return {
    leagues: displayLeagues,
    activeLeague,
    isLoading: isLoading || !isHydrated,
    setHomeLeague,
    hasLeagues: leagues.length > 0,
  };
}
