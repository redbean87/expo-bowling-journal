import { useEffect } from 'react';

import type { JournalClientSyncMap } from '@/screens/journal/journal-client-sync-map-storage';
import type { LeagueId } from '@/services/journal';
import type { Router } from 'expo-router';

type SelectedLeague = { _id: string; name?: string | null } | null;
type Navigation = {
  setOptions: (options: { headerTitle?: string; title?: string }) => void;
};

type UseSessionRouteSyncParams = {
  isFocused: boolean;
  leagueId: LeagueId | null;
  leagueClientSyncId: string | null;
  syncMap: JournalClientSyncMap;
  selectedLeague: SelectedLeague;
  leagueName: string | null | undefined;
  navigation: Navigation;
  router: Router;
};

export function useSessionRouteSync({
  isFocused,
  leagueId,
  leagueClientSyncId,
  syncMap,
  selectedLeague,
  leagueName,
  navigation,
  router,
}: UseSessionRouteSyncParams) {
  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (leagueId || !leagueClientSyncId) {
      return;
    }

    const mappedLeagueId = syncMap.leagues[leagueClientSyncId];

    if (!mappedLeagueId) {
      return;
    }

    router.replace({
      pathname: '/journal/[leagueId]/sessions' as never,
      params: { leagueId: mappedLeagueId } as never,
    } as never);
  }, [isFocused, leagueClientSyncId, leagueId, router, syncMap.leagues]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (leagueId || !selectedLeague) {
      return;
    }

    router.replace({
      pathname: '/journal/[leagueId]/sessions' as never,
      params: { leagueId: selectedLeague._id } as never,
    } as never);
  }, [isFocused, leagueId, router, selectedLeague]);

  useEffect(() => {
    const headerValue = leagueName ?? 'Sessions';

    navigation.setOptions({
      headerTitle: headerValue,
      title: headerValue,
    });
  }, [leagueName, navigation]);
}
