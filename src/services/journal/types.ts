import type { Doc, Id } from '../../../convex/_generated/dataModel';

export type League = Doc<'leagues'>;
export type Session = Doc<'sessions'>;
export type Game = Doc<'games'>;
export type Frame = Doc<'frames'>;

export type LeagueId = Id<'leagues'>;
export type SessionId = Id<'sessions'>;
export type GameId = Id<'games'>;
export type BallId = Id<'balls'>;
export type PatternId = Id<'patterns'>;

export type CreateLeagueInput = {
  name: string;
  houseId?: Id<'houses'> | null;
  houseName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type CreateSessionInput = {
  leagueId: LeagueId;
  weekNumber?: number | null;
  date: string;
};

export type CreateGameInput = {
  sessionId: SessionId;
  date: string;
  ballId?: BallId | null;
  patternId?: PatternId | null;
};

export type UpdateGameInput = {
  gameId: GameId;
  date: string;
  ballId?: BallId | null;
  patternId?: PatternId | null;
};

export type EditableFrameInput = {
  frameNumber: number;
  roll1: number;
  roll2?: number | null;
  roll3?: number | null;
};

export type ReplaceFramesInput = {
  gameId: GameId;
  frames: EditableFrameInput[];
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
  ballId?: BallId | null;
  ballName?: string | null;
  note?: string | null;
};

export type ApplyPostImportRefinementInput = {
  sessions?: Array<{
    sessionId: SessionId;
    laneContext?: ImportLaneContextInput | null;
    notes?: string | null;
  }>;
  games?: Array<{
    gameId: GameId;
    handicap?: number | null;
    laneContext?: ImportLaneContextInput | null;
    ballSwitches?: ImportBallSwitchInput[] | null;
    notes?: string | null;
  }>;
};

export type ApplyPostImportRefinementResult = {
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

export type ImportSqliteSnapshotInput = {
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
};

export type ImportSqliteSnapshotResult = {
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
  refinement: ApplyPostImportRefinementResult;
  warnings: Array<{
    recordType: 'session' | 'game';
    recordId: string;
    message: string;
  }>;
};

export type StartImportInput = {
  r2Key: string;
  fileName?: string | null;
  fileSize: number;
  checksum?: string | null;
  idempotencyKey: string;
};

export type StartImportResult = {
  batchId: Id<'importBatches'>;
  deduplicated: boolean;
};

export type ImportStatus = {
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
};
