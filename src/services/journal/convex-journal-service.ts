import {
  gamesCreateMutation,
  gamesListBySessionQuery,
  leaguesCreateMutation,
  leaguesListQuery,
  sessionsCreateMutation,
  sessionsListByLeagueQuery,
} from '@/convex/functions';

export const convexJournalService = {
  listLeagues: leaguesListQuery,
  createLeague: leaguesCreateMutation,
  listSessionsByLeague: sessionsListByLeagueQuery,
  createSession: sessionsCreateMutation,
  listGamesBySession: gamesListBySessionQuery,
  createGame: gamesCreateMutation,
} as const;
