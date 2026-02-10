import {
  framesListByGameQuery,
  framesReplaceForGameMutation,
  importsApplyPostImportRefinementMutation,
  importsSqliteSnapshotMutation,
  gamesCreateMutation,
  gamesGetByIdQuery,
  gamesListBySessionQuery,
  gamesUpdateMutation,
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
  getGameById: gamesGetByIdQuery,
  createGame: gamesCreateMutation,
  updateGame: gamesUpdateMutation,
  listFramesByGame: framesListByGameQuery,
  replaceFramesForGame: framesReplaceForGameMutation,
  applyPostImportRefinement: importsApplyPostImportRefinementMutation,
  importSqliteSnapshot: importsSqliteSnapshotMutation,
} as const;
