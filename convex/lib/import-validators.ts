import { v } from 'convex/values';

export const laneContextValidator = v.object({
  leftLane: v.optional(v.union(v.number(), v.null())),
  rightLane: v.optional(v.union(v.number(), v.null())),
  lanePair: v.optional(v.union(v.string(), v.null())),
  startingLane: v.optional(v.union(v.number(), v.null())),
});

export const ballSwitchValidator = v.object({
  frameNumber: v.number(),
  rollNumber: v.optional(v.union(v.number(), v.null())),
  ballId: v.optional(v.union(v.id('balls'), v.null())),
  ballName: v.optional(v.union(v.string(), v.null())),
  note: v.optional(v.union(v.string(), v.null())),
});

export const sqliteHouseValidator = v.object({
  sqliteId: v.number(),
  name: v.optional(v.union(v.string(), v.null())),
  sortOrder: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  location: v.optional(v.union(v.string(), v.null())),
});

export const sqlitePatternValidator = v.object({
  sqliteId: v.number(),
  name: v.optional(v.union(v.string(), v.null())),
  sortOrder: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  length: v.optional(v.union(v.number(), v.null())),
});

export const sqliteBallValidator = v.object({
  sqliteId: v.number(),
  name: v.optional(v.union(v.string(), v.null())),
  sortOrder: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  brand: v.optional(v.union(v.string(), v.null())),
  coverstock: v.optional(v.union(v.string(), v.null())),
});

export const sqliteLeagueValidator = v.object({
  sqliteId: v.number(),
  ballFk: v.optional(v.union(v.number(), v.null())),
  patternFk: v.optional(v.union(v.number(), v.null())),
  houseFk: v.optional(v.union(v.number(), v.null())),
  name: v.optional(v.union(v.string(), v.null())),
  games: v.optional(v.union(v.number(), v.null())),
  notes: v.optional(v.union(v.string(), v.null())),
  sortOrder: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
});

export const sqliteWeekValidator = v.object({
  sqliteId: v.number(),
  leagueFk: v.optional(v.union(v.number(), v.null())),
  ballFk: v.optional(v.union(v.number(), v.null())),
  patternFk: v.optional(v.union(v.number(), v.null())),
  houseFk: v.optional(v.union(v.number(), v.null())),
  date: v.optional(v.union(v.number(), v.string(), v.null())),
  notes: v.optional(v.union(v.string(), v.null())),
  lane: v.optional(v.union(v.number(), v.null())),
});

export const sqliteGameValidator = v.object({
  sqliteId: v.number(),
  weekFk: v.optional(v.union(v.number(), v.null())),
  leagueFk: v.optional(v.union(v.number(), v.null())),
  ballFk: v.optional(v.union(v.number(), v.null())),
  patternFk: v.optional(v.union(v.number(), v.null())),
  houseFk: v.optional(v.union(v.number(), v.null())),
  score: v.optional(v.union(v.number(), v.null())),
  frame: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  singlePinSpareScore: v.optional(v.union(v.number(), v.null())),
  notes: v.optional(v.union(v.string(), v.null())),
  lane: v.optional(v.union(v.number(), v.null())),
  date: v.optional(v.union(v.number(), v.string(), v.null())),
});

export const sqliteFrameValidator = v.object({
  sqliteId: v.number(),
  gameFk: v.optional(v.union(v.number(), v.null())),
  weekFk: v.optional(v.union(v.number(), v.null())),
  leagueFk: v.optional(v.union(v.number(), v.null())),
  ballFk: v.optional(v.union(v.number(), v.null())),
  frameNum: v.optional(v.union(v.number(), v.null())),
  pins: v.optional(v.union(v.number(), v.null())),
  scores: v.optional(v.union(v.number(), v.null())),
  score: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  pocket: v.optional(v.union(v.number(), v.null())),
  footBoard: v.optional(v.union(v.number(), v.null())),
  targetBoard: v.optional(v.union(v.number(), v.null())),
});

export const canonicalFrameInsertValidator = v.object({
  gameId: v.id('games'),
  frameNumber: v.number(),
  roll1: v.number(),
  roll2: v.union(v.number(), v.null()),
  roll3: v.union(v.number(), v.null()),
  ballId: v.union(v.id('balls'), v.null()),
  pins: v.union(v.number(), v.null()),
  scores: v.union(v.number(), v.null()),
  score: v.union(v.number(), v.null()),
  flags: v.union(v.number(), v.null()),
  pocket: v.union(v.number(), v.null()),
  footBoard: v.union(v.number(), v.null()),
  targetBoard: v.union(v.number(), v.null()),
});

export const replaceAllCleanupTableValidator = v.union(
  v.literal('frames'),
  v.literal('games'),
  v.literal('sessions'),
  v.literal('leagues'),
  v.literal('balls'),
  v.literal('importRawGames'),
  v.literal('importRawFrames'),
  v.literal('importRawWeeks'),
  v.literal('importRawLeagues'),
  v.literal('importRawBalls'),
  v.literal('importRawPatterns'),
  v.literal('importRawHouses')
);

export const rawImportTableValidator = v.union(
  v.literal('importRawHouses'),
  v.literal('importRawPatterns'),
  v.literal('importRawBalls'),
  v.literal('importRawLeagues'),
  v.literal('importRawWeeks'),
  v.literal('importRawGames'),
  v.literal('importRawFrames')
);

export const sqliteSnapshotArgs = {
  sourceFileName: v.optional(v.union(v.string(), v.null())),
  sourceHash: v.optional(v.union(v.string(), v.null())),
  houses: v.array(sqliteHouseValidator),
  patterns: v.array(sqlitePatternValidator),
  balls: v.array(sqliteBallValidator),
  leagues: v.array(sqliteLeagueValidator),
  weeks: v.array(sqliteWeekValidator),
  games: v.array(sqliteGameValidator),
  frames: v.array(sqliteFrameValidator),
};

export const postImportRefinementArgs = {
  sessions: v.optional(
    v.array(
      v.object({
        sessionId: v.id('sessions'),
        laneContext: v.optional(v.union(laneContextValidator, v.null())),
        notes: v.optional(v.union(v.string(), v.null())),
      })
    )
  ),
  games: v.optional(
    v.array(
      v.object({
        gameId: v.id('games'),
        handicap: v.optional(v.union(v.number(), v.null())),
        laneContext: v.optional(v.union(laneContextValidator, v.null())),
        ballSwitches: v.optional(
          v.union(v.array(ballSwitchValidator), v.null())
        ),
        notes: v.optional(v.union(v.string(), v.null())),
      })
    )
  ),
};

const refinementWarningValidator = v.object({
  recordType: v.union(v.literal('session'), v.literal('game')),
  recordId: v.string(),
  message: v.string(),
});

export const completeSnapshotImportArgs = {
  batchId: v.id('importBatches'),
  counts: v.object({
    houses: v.number(),
    leagues: v.number(),
    weeks: v.number(),
    sessions: v.number(),
    balls: v.number(),
    games: v.number(),
    frames: v.number(),
    patterns: v.number(),
  }),
  refinement: v.object({
    sessionsProcessed: v.number(),
    sessionsPatched: v.number(),
    sessionsSkipped: v.number(),
    gamesProcessed: v.number(),
    gamesPatched: v.number(),
    gamesSkipped: v.number(),
    warnings: v.array(refinementWarningValidator),
  }),
  warnings: v.array(refinementWarningValidator),
};

export const startImportArgs = {
  r2Key: v.string(),
  fileName: v.optional(v.union(v.string(), v.null())),
  fileSize: v.number(),
  checksum: v.optional(v.union(v.string(), v.null())),
  idempotencyKey: v.string(),
  timezoneOffsetMinutes: v.optional(v.union(v.number(), v.null())),
};

export const dispatchImportQueueArgs = {
  batchId: v.id('importBatches'),
  userId: v.id('users'),
  r2Key: v.string(),
  timezoneOffsetMinutes: v.optional(v.union(v.number(), v.null())),
};

export const batchIdArgs = {
  batchId: v.id('importBatches'),
};

export const updateBatchStatusArgs = {
  batchId: v.id('importBatches'),
  status: v.union(
    v.literal('parsing'),
    v.literal('importing'),
    v.literal('completed'),
    v.literal('failed')
  ),
  completedAt: v.optional(v.union(v.number(), v.null())),
  errorMessage: v.optional(v.union(v.string(), v.null())),
};

export const nonceLookupArgs = {
  nonce: v.string(),
};

export const insertNonceArgs = {
  nonce: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
};

export const createImportBatchForSnapshotArgs = {
  userId: v.id('users'),
  sourceFileName: v.optional(v.union(v.string(), v.null())),
  sourceHash: v.optional(v.union(v.string(), v.null())),
};

export const persistRawImportChunkArgs = {
  batchId: v.id('importBatches'),
  table: rawImportTableValidator,
  rows: v.array(v.any()),
};

export const importSqliteSnapshotAfterCleanupArgs = {
  userId: v.id('users'),
  batchId: v.optional(v.union(v.id('importBatches'), v.null())),
  skipRawMirrorPersistence: v.optional(v.boolean()),
  ...sqliteSnapshotArgs,
};

export const submitParsedSnapshotArgs = {
  batchId: v.id('importBatches'),
  parserVersion: v.optional(v.union(v.string(), v.null())),
  skipReplaceAllCleanup: v.optional(v.boolean()),
  skipRawMirrorPersistence: v.optional(v.boolean()),
  timezoneOffsetMinutes: v.optional(v.union(v.number(), v.null())),
  snapshot: v.object(sqliteSnapshotArgs),
};

export const submitParsedSnapshotJsonArgs = {
  batchId: v.id('importBatches'),
  parserVersion: v.optional(v.union(v.string(), v.null())),
  skipReplaceAllCleanup: v.optional(v.boolean()),
  skipRawMirrorPersistence: v.optional(v.boolean()),
  timezoneOffsetMinutes: v.optional(v.union(v.number(), v.null())),
  snapshotJson: v.string(),
};

export const persistCanonicalFrameChunkArgs = {
  batchId: v.id('importBatches'),
  frames: v.array(canonicalFrameInsertValidator),
};

export const deleteUserDocsChunkForImportArgs = {
  userId: v.id('users'),
  table: replaceAllCleanupTableValidator,
  chunkSize: v.optional(v.number()),
};
