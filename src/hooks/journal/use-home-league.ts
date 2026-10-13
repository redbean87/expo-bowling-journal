import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  listLocalLeagueSummaries,
  type LocalLeagueSummaryView,
} from '@/services/journal/local-reads';

const HOME_LEAGUE_STORAGE_KEY = '@bowling-journal:home-league-id';

// The cloud leagues list applies a 3-month recency cutoff; the local read
// keeps the same product semantics by filtering client-side.
function getThreeMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type DisplayLeague = {
  _id: string;
  name: string;
  houseName: string | null;
  gamesPerSession: number | null;
  mostRecentSessionDate: string | null;
};

export function useHomeLeague() {
  const cutoffDate = getThreeMonthsAgo();

  const [localLeagues, setLocalLeagues] = useState<
    LocalLeagueSummaryView[] | null
  >(null);
  const [isLocalLeaguesLoading, setIsLocalLeaguesLoading] = useState(true);

  // Local SQLite is the authoritative league read: always loaded, no Convex
  // query, no cloud cache, no auth gate.
  useEffect(() => {
    let isMounted = true;

    const loadLocalLeagues = async () => {
      try {
        const localList = await listLocalLeagueSummaries();

        if (isMounted) {
          setLocalLeagues(localList);
        }
      } catch {
        if (isMounted) {
          setLocalLeagues([]);
        }
      } finally {
        if (isMounted) {
          setIsLocalLeaguesLoading(false);
        }
      }
    };

    void loadLocalLeagues();

    return () => {
      isMounted = false;
    };
  }, []);

  const leagues = useMemo(() => {
    return (localLeagues ?? []).filter(
      (league) =>
        league.mostRecentSessionDate === null ||
        league.mostRecentSessionDate >= cutoffDate
    );
  }, [localLeagues, cutoffDate]);

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
    isLoading: isLocalLeaguesLoading || !isHydrated,
    setHomeLeague,
    hasLeagues: leagues.length > 0,
  };
}
