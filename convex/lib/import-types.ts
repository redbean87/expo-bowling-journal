import type { BallSwitchInput, LaneContextInput } from './import_refinement';
import type { Doc, Id } from '../_generated/dataModel';

export type SessionRefinementInput = {
  sessionId: Id<'sessions'>;
  laneContext?: LaneContextInput | null;
  notes?: string | null;
};

export type GameRefinementInput = {
  gameId: Id<'games'>;
  handicap?: number | null;
  laneContext?: LaneContextInput | null;
  ballSwitches?: BallSwitchInput[] | null;
  notes?: string | null;
};

export type RefinementWarning = {
  recordType: 'session' | 'game';
  recordId: string;
  message: string;
};

export type RefinementResult = {
  sessionsProcessed: number;
  sessionsPatched: number;
  sessionsSkipped: number;
  gamesProcessed: number;
  gamesPatched: number;
  gamesSkipped: number;
  warnings: RefinementWarning[];
};

export type ImportResult = {
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
  refinement: RefinementResult;
  warnings: RefinementWarning[];
};

export type SnapshotImportCoreResult = ImportResult & {
  gameIdMappings: Array<{ sqliteGameId: number; gameId: Id<'games'> }>;
  ballIdMappings: Array<{ sqliteBallId: number; ballId: Id<'balls'> }>;
};

export type SqliteSnapshotInput = {
  sourceFileName?: string | null;
  sourceHash?: string | null;
  houses: Array<Doc<'importRawHouses'>['raw']>;
  patterns: Array<Doc<'importRawPatterns'>['raw']>;
  balls: Array<Doc<'importRawBalls'>['raw']>;
  leagues: Array<Doc<'importRawLeagues'>['raw']>;
  weeks: Array<Doc<'importRawWeeks'>['raw']>;
  games: Array<Doc<'importRawGames'>['raw']>;
  frames: Array<Doc<'importRawFrames'>['raw']>;
};

export const EMPTY_IMPORT_COUNTS = {
  houses: 0,
  leagues: 0,
  weeks: 0,
  sessions: 0,
  balls: 0,
  games: 0,
  frames: 0,
  patterns: 0,
  gamesRefined: 0,
  gamesPatched: 0,
  warnings: 0,
} as const;

export const REPLACE_ALL_CLEANUP_TABLES = [
  'frames',
  'games',
  'sessions',
  'leagues',
  'balls',
  'importRawGames',
  'importRawFrames',
  'importRawWeeks',
  'importRawLeagues',
  'importRawBalls',
  'importRawPatterns',
  'importRawHouses',
] as const;

export type ReplaceAllCleanupTable =
  (typeof REPLACE_ALL_CLEANUP_TABLES)[number];

export const DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE = 128;
export const DEFAULT_RAW_IMPORT_CHUNK_SIZE = 500;

export type RawImportTable =
  | 'importRawHouses'
  | 'importRawPatterns'
  | 'importRawBalls'
  | 'importRawLeagues'
  | 'importRawWeeks'
  | 'importRawGames'
  | 'importRawFrames';

export type RawImportRow =
  | Doc<'importRawHouses'>['raw']
  | Doc<'importRawPatterns'>['raw']
  | Doc<'importRawBalls'>['raw']
  | Doc<'importRawLeagues'>['raw']
  | Doc<'importRawWeeks'>['raw']
  | Doc<'importRawGames'>['raw']
  | Doc<'importRawFrames'>['raw'];
