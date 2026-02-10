import { makeFunctionReference } from 'convex/server';

import type { Doc, Id } from '../../convex/_generated/dataModel';

export type ViewerQueryResult = {
  subject: string;
  name: string | null;
  email: string | null;
} | null;

type LeagueDoc = Doc<'leagues'>;
type SessionDoc = Doc<'sessions'>;
type GameDoc = Doc<'games'>;
type FrameDoc = Doc<'frames'>;

export type ImportLaneContextInput = {
  leftLane?: number | null;
  rightLane?: number | null;
  lanePair?: string | null;
  startingLane?: number | null;
};

export type ImportBallSwitchInput = {
  frameNumber: number;
  rollNumber?: number | null;
  ballId?: Id<'balls'> | null;
  ballName?: string | null;
  note?: string | null;
};

export const viewerQuery = makeFunctionReference<
  'query',
  Record<string, never>,
  ViewerQueryResult
>('users:viewer');

export const leaguesListQuery = makeFunctionReference<
  'query',
  Record<string, never>,
  LeagueDoc[]
>('leagues:list');

export const leaguesCreateMutation = makeFunctionReference<
  'mutation',
  {
    name: string;
    houseId?: Id<'houses'> | null;
    houseName?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
  Id<'leagues'>
>('leagues:create');

export const sessionsListByLeagueQuery = makeFunctionReference<
  'query',
  {
    leagueId: Id<'leagues'>;
  },
  SessionDoc[]
>('sessions:listByLeague');

export const sessionsCreateMutation = makeFunctionReference<
  'mutation',
  {
    leagueId: Id<'leagues'>;
    weekNumber?: number | null;
    date: string;
  },
  Id<'sessions'>
>('sessions:create');

export const gamesListBySessionQuery = makeFunctionReference<
  'query',
  {
    sessionId: Id<'sessions'>;
  },
  GameDoc[]
>('games:listBySession');

export const gamesCreateMutation = makeFunctionReference<
  'mutation',
  {
    sessionId: Id<'sessions'>;
    date: string;
    ballId?: Id<'balls'> | null;
    patternId?: Id<'patterns'> | null;
  },
  Id<'games'>
>('games:create');

export const gamesGetByIdQuery = makeFunctionReference<
  'query',
  {
    gameId: Id<'games'>;
  },
  GameDoc
>('games:getById');

export const gamesUpdateMutation = makeFunctionReference<
  'mutation',
  {
    gameId: Id<'games'>;
    date: string;
    ballId?: Id<'balls'> | null;
    patternId?: Id<'patterns'> | null;
  },
  Id<'games'>
>('games:update');

export const framesListByGameQuery = makeFunctionReference<
  'query',
  {
    gameId: Id<'games'>;
  },
  FrameDoc[]
>('frames:listByGame');

export const framesReplaceForGameMutation = makeFunctionReference<
  'mutation',
  {
    gameId: Id<'games'>;
    frames: Array<{
      frameNumber: number;
      roll1: number;
      roll2?: number | null;
      roll3?: number | null;
    }>;
  },
  Id<'games'>
>('frames:replaceForGame');

export const importsApplyPostImportRefinementMutation = makeFunctionReference<
  'mutation',
  {
    sessions?: Array<{
      sessionId: Id<'sessions'>;
      laneContext?: ImportLaneContextInput | null;
      notes?: string | null;
    }>;
    games?: Array<{
      gameId: Id<'games'>;
      handicap?: number | null;
      laneContext?: ImportLaneContextInput | null;
      ballSwitches?: ImportBallSwitchInput[] | null;
      notes?: string | null;
    }>;
  },
  {
    sessionsProcessed: number;
    sessionsPatched: number;
    sessionsSkipped: number;
    gamesProcessed: number;
    gamesPatched: number;
    gamesSkipped: number;
    warnings: Array<{
      recordType: 'session' | 'game';
      recordId: string;
      message: string;
    }>;
  }
>('imports:applyPostImportRefinement');

export const importsSqliteSnapshotMutation = makeFunctionReference<
  'mutation',
  {
    sourceFileName?: string | null;
    sourceHash?: string | null;
    houses: Array<{
      sqliteId: number;
      name?: string | null;
      sortOrder?: number | null;
      flags?: number | null;
      location?: string | null;
    }>;
    patterns: Array<{
      sqliteId: number;
      name?: string | null;
      sortOrder?: number | null;
      flags?: number | null;
      length?: number | null;
    }>;
    balls: Array<{
      sqliteId: number;
      name?: string | null;
      sortOrder?: number | null;
      flags?: number | null;
      brand?: string | null;
      coverstock?: string | null;
    }>;
    leagues: Array<{
      sqliteId: number;
      ballFk?: number | null;
      patternFk?: number | null;
      houseFk?: number | null;
      name?: string | null;
      games?: number | null;
      notes?: string | null;
      sortOrder?: number | null;
      flags?: number | null;
    }>;
    weeks: Array<{
      sqliteId: number;
      leagueFk?: number | null;
      ballFk?: number | null;
      patternFk?: number | null;
      houseFk?: number | null;
      date?: number | string | null;
      notes?: string | null;
      lane?: number | null;
    }>;
    games: Array<{
      sqliteId: number;
      weekFk?: number | null;
      leagueFk?: number | null;
      ballFk?: number | null;
      patternFk?: number | null;
      houseFk?: number | null;
      score?: number | null;
      frame?: number | null;
      flags?: number | null;
      singlePinSpareScore?: number | null;
      notes?: string | null;
      lane?: number | null;
      date?: number | string | null;
    }>;
    frames: Array<{
      sqliteId: number;
      gameFk?: number | null;
      weekFk?: number | null;
      leagueFk?: number | null;
      ballFk?: number | null;
      frameNum?: number | null;
      pins?: number | null;
      scores?: number | null;
      score?: number | null;
      flags?: number | null;
      pocket?: number | null;
      footBoard?: number | null;
      targetBoard?: number | null;
    }>;
  },
  {
    batchId: Id<'importBatches'>;
    counts: {
      houses: number;
      leagues: number;
      weeks: number;
      sessions: number;
      balls: number;
      games: number;
      frames: number;
      patterns: number;
    };
    refinement: {
      sessionsProcessed: number;
      sessionsPatched: number;
      sessionsSkipped: number;
      gamesProcessed: number;
      gamesPatched: number;
      gamesSkipped: number;
      warnings: Array<{
        recordType: 'session' | 'game';
        recordId: string;
        message: string;
      }>;
    };
    warnings: Array<{
      recordType: 'session' | 'game';
      recordId: string;
      message: string;
    }>;
  }
>('imports:importSqliteSnapshot');
