import { makeFunctionReference } from 'convex/server';

import type { Doc, Id } from '../../convex/_generated/dataModel';

export type ViewerQueryResult = {
  userId: Id<'users'>;
  subject: string;
  name: string | null;
  email: string | null;
} | null;

type LeagueDoc = Doc<'leagues'>;
type SessionDoc = Doc<'sessions'>;
type GameDoc = Doc<'games'>;
type FrameDoc = Doc<'frames'>;
type BallDoc = Doc<'balls'>;
type PatternDoc = Doc<'patterns'>;
type HouseDoc = Doc<'houses'>;

export type GameListItem = GameDoc & {
  framePreview?: Array<{
    text: string;
    hasSplit: boolean;
  }>;
};

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
    gamesPerSession?: number | null;
    houseId?: Id<'houses'> | null;
    houseName?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
  Id<'leagues'>
>('leagues:create');

export const leaguesUpdateMutation = makeFunctionReference<
  'mutation',
  {
    leagueId: Id<'leagues'>;
    name: string;
    gamesPerSession?: number | null;
    houseId?: Id<'houses'> | null;
  },
  Id<'leagues'>
>('leagues:update');

export const leaguesRemoveMutation = makeFunctionReference<
  'mutation',
  {
    leagueId: Id<'leagues'>;
  },
  Id<'leagues'>
>('leagues:remove');

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
    houseId?: Id<'houses'> | null;
    ballId?: Id<'balls'> | null;
    patternId?: Id<'patterns'> | null;
  },
  Id<'sessions'>
>('sessions:create');

export const sessionsUpdateMutation = makeFunctionReference<
  'mutation',
  {
    sessionId: Id<'sessions'>;
    weekNumber?: number | null;
    date: string;
    houseId?: Id<'houses'> | null;
    ballId?: Id<'balls'> | null;
    patternId?: Id<'patterns'> | null;
  },
  Id<'sessions'>
>('sessions:update');

export const sessionsRemoveMutation = makeFunctionReference<
  'mutation',
  {
    sessionId: Id<'sessions'>;
  },
  Id<'sessions'>
>('sessions:remove');

export const gamesListBySessionQuery = makeFunctionReference<
  'query',
  {
    sessionId: Id<'sessions'>;
  },
  GameListItem[]
>('games:listBySession');

export const gamesCreateMutation = makeFunctionReference<
  'mutation',
  {
    sessionId: Id<'sessions'>;
    date: string;
    ballId?: Id<'balls'> | null;
    patternId?: Id<'patterns'> | null;
    houseId?: Id<'houses'> | null;
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
    houseId?: Id<'houses'> | null;
  },
  Id<'games'>
>('games:update');

export const ballsListQuery = makeFunctionReference<
  'query',
  Record<string, never>,
  BallDoc[]
>('balls:list');

export const ballsListRecentQuery = makeFunctionReference<
  'query',
  Record<string, never>,
  BallDoc[]
>('balls:listRecent');

export const ballsCreateMutation = makeFunctionReference<
  'mutation',
  {
    name: string;
  },
  Id<'balls'>
>('balls:create');

export const patternsListQuery = makeFunctionReference<
  'query',
  Record<string, never>,
  PatternDoc[]
>('patterns:list');

export const patternsListRecentQuery = makeFunctionReference<
  'query',
  Record<string, never>,
  PatternDoc[]
>('patterns:listRecent');

export const patternsCreateMutation = makeFunctionReference<
  'mutation',
  {
    name: string;
  },
  Id<'patterns'>
>('patterns:create');

export const housesListQuery = makeFunctionReference<
  'query',
  Record<string, never>,
  HouseDoc[]
>('houses:list');

export const housesListRecentQuery = makeFunctionReference<
  'query',
  Record<string, never>,
  HouseDoc[]
>('houses:listRecent');

export const housesCreateMutation = makeFunctionReference<
  'mutation',
  {
    name: string;
  },
  Id<'houses'>
>('houses:create');

export const gamesRemoveMutation = makeFunctionReference<
  'mutation',
  {
    gameId: Id<'games'>;
  },
  Id<'games'>
>('games:remove');

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
      pins?: number | null;
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
  'action',
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

export const importsStartImportMutation = makeFunctionReference<
  'mutation',
  {
    r2Key: string;
    fileName?: string | null;
    fileSize: number;
    checksum?: string | null;
    idempotencyKey: string;
    timezoneOffsetMinutes?: number | null;
  },
  {
    batchId: Id<'importBatches'>;
    deduplicated: boolean;
  }
>('imports:startImport');

export const importsGetImportStatusQuery = makeFunctionReference<
  'query',
  {
    batchId: Id<'importBatches'>;
  },
  {
    batchId: Id<'importBatches'>;
    status: string;
    sourceType: string;
    r2Key: string | null;
    sourceFileName: string | null;
    fileSize: number | null;
    sourceHash: string | null;
    importedAt: number;
    completedAt: number | null;
    errorMessage: string | null;
    counts: {
      houses: number;
      leagues: number;
      weeks: number;
      sessions: number;
      balls: number;
      games: number;
      frames: number;
      patterns: number;
      gamesRefined: number;
      gamesPatched: number;
      warnings: number;
    };
  }
>('imports:getImportStatus');
