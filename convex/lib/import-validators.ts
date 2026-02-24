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
