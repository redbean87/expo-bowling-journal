import { v } from 'convex/values';

import { mutation } from './_generated/server';
import { requireUserId } from './lib/auth';
import {
  laneContextFromLane,
  normalizeBallSwitches,
  normalizeLaneContext,
  normalizeNullableInteger,
  normalizeOptionalText,
} from './lib/import-refinement';

import type { Doc, Id, TableNames } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import type {
  BallSwitchInput,
  LaneContextInput,
} from './lib/import-refinement';

type SessionRefinementInput = {
  sessionId: Id<'sessions'>;
  laneContext?: LaneContextInput | null;
  notes?: string | null;
};

type GameRefinementInput = {
  gameId: Id<'games'>;
  handicap?: number | null;
  laneContext?: LaneContextInput | null;
  ballSwitches?: BallSwitchInput[] | null;
  notes?: string | null;
};

type RefinementWarning = {
  recordType: 'session' | 'game';
  recordId: string;
  message: string;
};

type RefinementResult = {
  sessionsProcessed: number;
  sessionsPatched: number;
  sessionsSkipped: number;
  gamesProcessed: number;
  gamesPatched: number;
  gamesSkipped: number;
  warnings: RefinementWarning[];
};

const laneContextValidator = v.object({
  leftLane: v.optional(v.union(v.number(), v.null())),
  rightLane: v.optional(v.union(v.number(), v.null())),
  lanePair: v.optional(v.union(v.string(), v.null())),
  startingLane: v.optional(v.union(v.number(), v.null())),
});

const ballSwitchValidator = v.object({
  frameNumber: v.number(),
  rollNumber: v.optional(v.union(v.number(), v.null())),
  ballId: v.optional(v.union(v.id('balls'), v.null())),
  ballName: v.optional(v.union(v.string(), v.null())),
  note: v.optional(v.union(v.string(), v.null())),
});

const sqliteHouseValidator = v.object({
  sqliteId: v.number(),
  name: v.optional(v.union(v.string(), v.null())),
  sortOrder: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  location: v.optional(v.union(v.string(), v.null())),
});

const sqlitePatternValidator = v.object({
  sqliteId: v.number(),
  name: v.optional(v.union(v.string(), v.null())),
  sortOrder: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  length: v.optional(v.union(v.number(), v.null())),
});

const sqliteBallValidator = v.object({
  sqliteId: v.number(),
  name: v.optional(v.union(v.string(), v.null())),
  sortOrder: v.optional(v.union(v.number(), v.null())),
  flags: v.optional(v.union(v.number(), v.null())),
  brand: v.optional(v.union(v.string(), v.null())),
  coverstock: v.optional(v.union(v.string(), v.null())),
});

const sqliteLeagueValidator = v.object({
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

const sqliteWeekValidator = v.object({
  sqliteId: v.number(),
  leagueFk: v.optional(v.union(v.number(), v.null())),
  ballFk: v.optional(v.union(v.number(), v.null())),
  patternFk: v.optional(v.union(v.number(), v.null())),
  houseFk: v.optional(v.union(v.number(), v.null())),
  date: v.optional(v.union(v.number(), v.string(), v.null())),
  notes: v.optional(v.union(v.string(), v.null())),
  lane: v.optional(v.union(v.number(), v.null())),
});

const sqliteGameValidator = v.object({
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

const sqliteFrameValidator = v.object({
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

function hasOwn(object: object, property: string) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function normalizeName(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value, 120);
  return normalized;
}

function normalizeDate(
  value: number | string | null | undefined,
  label: string,
  fallbackDate: string
): { date: string; warning: string | null } {
  if (value === undefined || value === null) {
    return { date: fallbackDate, warning: null };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length >= 10) {
      return {
        date: trimmed.slice(0, 10),
        warning: null,
      };
    }

    return {
      date: fallbackDate,
      warning: `${label}: invalid string date, used fallback`,
    };
  }

  let timestampMs = value;

  if (Math.abs(value) < 10_000_000_000) {
    timestampMs = value * 1000;
  }

  const parsed = new Date(timestampMs);

  if (Number.isNaN(parsed.getTime())) {
    return {
      date: fallbackDate,
      warning: `${label}: invalid numeric date, used fallback`,
    };
  }

  return {
    date: parsed.toISOString().slice(0, 10),
    warning: null,
  };
}

async function deleteDocsById(
  ctx: MutationCtx,
  docs: Array<{ _id: Id<TableNames> }>
) {
  for (const doc of docs) {
    await ctx.db.delete(doc._id);
  }
}

async function resolveBallName(
  ctx: MutationCtx,
  userId: Id<'users'>,
  ballId: Id<'balls'>
) {
  const ball = await ctx.db.get(ballId);

  if (!ball || ball.userId !== userId) {
    return null;
  }

  return ball.name;
}

async function applyRefinement(
  ctx: MutationCtx,
  userId: Id<'users'>,
  args: {
    sessions: SessionRefinementInput[];
    games: GameRefinementInput[];
  }
): Promise<RefinementResult> {
  const warnings: RefinementWarning[] = [];
  let sessionsPatched = 0;
  let sessionsSkipped = 0;
  let gamesPatched = 0;
  let gamesSkipped = 0;

  for (const sessionInput of args.sessions) {
    const session = await ctx.db.get(sessionInput.sessionId);

    if (!session || session.userId !== userId) {
      sessionsSkipped += 1;
      warnings.push({
        recordType: 'session',
        recordId: String(sessionInput.sessionId),
        message: 'Session not found or not owned by current user',
      });
      continue;
    }

    const patch: Partial<Doc<'sessions'>> = {};
    const localWarnings: string[] = [];

    if (hasOwn(sessionInput, 'notes')) {
      patch.notes = normalizeOptionalText(sessionInput.notes);
    }

    if (hasOwn(sessionInput, 'laneContext')) {
      patch.laneContext =
        normalizeLaneContext(
          sessionInput.laneContext,
          localWarnings,
          `session ${sessionInput.sessionId}`
        ) ?? null;
    }

    for (const warning of localWarnings) {
      warnings.push({
        recordType: 'session',
        recordId: String(sessionInput.sessionId),
        message: warning,
      });
    }

    if (Object.keys(patch).length === 0) {
      sessionsSkipped += 1;
      continue;
    }

    await ctx.db.patch(sessionInput.sessionId, patch);
    sessionsPatched += 1;
  }

  for (const gameInput of args.games) {
    const game = await ctx.db.get(gameInput.gameId);

    if (!game || game.userId !== userId) {
      gamesSkipped += 1;
      warnings.push({
        recordType: 'game',
        recordId: String(gameInput.gameId),
        message: 'Game not found or not owned by current user',
      });
      continue;
    }

    const patch: Partial<Doc<'games'>> = {};
    const localWarnings: string[] = [];

    if (hasOwn(gameInput, 'handicap')) {
      const normalizedHandicap = normalizeNullableInteger(
        gameInput.handicap,
        -200,
        200
      );

      if (gameInput.handicap !== undefined && normalizedHandicap === null) {
        localWarnings.push('handicap must be an integer between -200 and 200');
      }

      patch.handicap = normalizedHandicap;
    }

    if (hasOwn(gameInput, 'notes')) {
      patch.notes = normalizeOptionalText(gameInput.notes);
    }

    if (hasOwn(gameInput, 'laneContext')) {
      patch.laneContext =
        normalizeLaneContext(
          gameInput.laneContext,
          localWarnings,
          `game ${gameInput.gameId}`
        ) ?? null;
    }

    if (hasOwn(gameInput, 'ballSwitches')) {
      const normalizedSwitches = normalizeBallSwitches(
        gameInput.ballSwitches,
        localWarnings,
        `game ${gameInput.gameId}`
      );

      if (normalizedSwitches === null) {
        patch.ballSwitches = null;
      } else {
        const verifiedSwitches: BallSwitchInput[] = [];

        for (const ballSwitch of normalizedSwitches) {
          if (!ballSwitch.ballId) {
            verifiedSwitches.push(ballSwitch);
            continue;
          }

          const ballName = await resolveBallName(
            ctx,
            userId,
            ballSwitch.ballId
          );

          if (!ballName) {
            localWarnings.push(
              `game ${gameInput.gameId}: ball ${ballSwitch.ballId} is missing or unauthorized`
            );
            verifiedSwitches.push({
              ...ballSwitch,
              ballId: null,
              ballName: ballSwitch.ballName ?? null,
            });
            continue;
          }

          verifiedSwitches.push({
            ...ballSwitch,
            ballName: ballSwitch.ballName ?? ballName,
          });
        }

        patch.ballSwitches = verifiedSwitches;
      }
    }

    for (const warning of localWarnings) {
      warnings.push({
        recordType: 'game',
        recordId: String(gameInput.gameId),
        message: warning,
      });
    }

    if (Object.keys(patch).length === 0) {
      gamesSkipped += 1;
      continue;
    }

    await ctx.db.patch(gameInput.gameId, patch);
    gamesPatched += 1;
  }

  return {
    sessionsProcessed: args.sessions.length,
    sessionsPatched,
    sessionsSkipped,
    gamesProcessed: args.games.length,
    gamesPatched,
    gamesSkipped,
    warnings,
  };
}

export const applyPostImportRefinement = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    return applyRefinement(ctx, userId, {
      sessions: args.sessions ?? [],
      games: args.games ?? [],
    });
  },
});

export const importSqliteSnapshot = mutation({
  args: {
    sourceFileName: v.optional(v.union(v.string(), v.null())),
    sourceHash: v.optional(v.union(v.string(), v.null())),
    houses: v.array(sqliteHouseValidator),
    patterns: v.array(sqlitePatternValidator),
    balls: v.array(sqliteBallValidator),
    leagues: v.array(sqliteLeagueValidator),
    weeks: v.array(sqliteWeekValidator),
    games: v.array(sqliteGameValidator),
    frames: v.array(sqliteFrameValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const importedAt = Date.now();
    const today = new Date(importedAt).toISOString().slice(0, 10);
    const importWarnings: RefinementWarning[] = [];

    const existingFrames = await ctx.db
      .query('frames')
      .withIndex('by_user_game', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingFrames);

    const existingGames = await ctx.db
      .query('games')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingGames);

    const existingSessions = await ctx.db
      .query('sessions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingSessions);

    const existingLeagues = await ctx.db
      .query('leagues')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingLeagues);

    const existingBalls = await ctx.db
      .query('balls')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingBalls);

    const existingRawFrames = await ctx.db
      .query('importRawFrames')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingRawFrames);

    const existingRawGames = await ctx.db
      .query('importRawGames')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingRawGames);

    const existingRawWeeks = await ctx.db
      .query('importRawWeeks')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingRawWeeks);

    const existingRawLeagues = await ctx.db
      .query('importRawLeagues')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingRawLeagues);

    const existingRawBalls = await ctx.db
      .query('importRawBalls')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingRawBalls);

    const existingRawPatterns = await ctx.db
      .query('importRawPatterns')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingRawPatterns);

    const existingRawHouses = await ctx.db
      .query('importRawHouses')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingRawHouses);

    const existingBatches = await ctx.db
      .query('importBatches')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await deleteDocsById(ctx, existingBatches);

    const batchId = await ctx.db.insert('importBatches', {
      userId,
      sourceType: 'sqlite',
      sourceFileName: normalizeOptionalText(args.sourceFileName, 255),
      sourceHash: normalizeOptionalText(args.sourceHash, 128),
      status: 'running',
      importedAt,
      completedAt: null,
      counts: {
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
      },
    });

    const houseIdMap = new Map<number, Id<'houses'>>();
    const houseByName = new Map<string, Id<'houses'>>();

    for (const row of args.houses) {
      await ctx.db.insert('importRawHouses', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });

      const name = normalizeName(row.name);

      if (!name) {
        importWarnings.push({
          recordType: 'session',
          recordId: String(row.sqliteId),
          message: 'house is missing a valid name and was not normalized',
        });
        continue;
      }

      const key = name.toLowerCase();
      const cachedHouseId = houseByName.get(key);

      if (cachedHouseId) {
        houseIdMap.set(row.sqliteId, cachedHouseId);
        continue;
      }

      const existingHouse = await ctx.db
        .query('houses')
        .withIndex('by_name', (q) => q.eq('name', name))
        .first();

      if (existingHouse) {
        houseIdMap.set(row.sqliteId, existingHouse._id);
        houseByName.set(key, existingHouse._id);
        continue;
      }

      const createdHouseId = await ctx.db.insert('houses', {
        name,
        location: normalizeOptionalText(row.location, 180),
      });
      houseIdMap.set(row.sqliteId, createdHouseId);
      houseByName.set(key, createdHouseId);
    }

    const patternIdMap = new Map<number, Id<'patterns'>>();
    const patternByName = new Map<string, Id<'patterns'>>();

    for (const row of args.patterns) {
      await ctx.db.insert('importRawPatterns', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });

      const name = normalizeName(row.name);

      if (!name) {
        continue;
      }

      const key = name.toLowerCase();
      const cachedPatternId = patternByName.get(key);

      if (cachedPatternId) {
        patternIdMap.set(row.sqliteId, cachedPatternId);
        continue;
      }

      const existingPattern = await ctx.db
        .query('patterns')
        .withIndex('by_name', (q) => q.eq('name', name))
        .first();

      if (existingPattern) {
        patternIdMap.set(row.sqliteId, existingPattern._id);
        patternByName.set(key, existingPattern._id);
        continue;
      }

      const createdPatternId = await ctx.db.insert('patterns', {
        name,
        length: normalizeNullableInteger(row.length, 0, 80),
      });
      patternIdMap.set(row.sqliteId, createdPatternId);
      patternByName.set(key, createdPatternId);
    }

    const ballIdMap = new Map<number, Id<'balls'>>();
    const ballNameBySqlite = new Map<number, string>();

    for (const row of args.balls) {
      await ctx.db.insert('importRawBalls', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });

      const name = normalizeName(row.name);

      if (!name) {
        importWarnings.push({
          recordType: 'game',
          recordId: String(row.sqliteId),
          message: 'ball is missing a valid name and was not normalized',
        });
        continue;
      }

      ballNameBySqlite.set(row.sqliteId, name);

      const existingBall = await ctx.db
        .query('balls')
        .withIndex('by_user_name', (q) =>
          q.eq('userId', userId).eq('name', name)
        )
        .first();

      if (existingBall) {
        ballIdMap.set(row.sqliteId, existingBall._id);
        continue;
      }

      const createdBallId = await ctx.db.insert('balls', {
        userId,
        name,
        brand: normalizeOptionalText(row.brand, 120),
        coverstock: normalizeOptionalText(row.coverstock, 120),
      });
      ballIdMap.set(row.sqliteId, createdBallId);
    }

    const leagueIdMap = new Map<number, Id<'leagues'>>();

    for (const row of args.leagues) {
      await ctx.db.insert('importRawLeagues', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });

      const name =
        normalizeName(row.name) ?? `Imported League ${String(row.sqliteId)}`;
      const houseId = row.houseFk
        ? (houseIdMap.get(row.houseFk) ?? null)
        : null;
      const houseName = houseId
        ? ((await ctx.db.get(houseId))?.name ?? null)
        : null;
      const leagueId = await ctx.db.insert('leagues', {
        userId,
        name,
        houseId,
        houseName,
        startDate: null,
        endDate: null,
        createdAt: importedAt,
      });
      leagueIdMap.set(row.sqliteId, leagueId);
    }

    const sessionIdMap = new Map<number, Id<'sessions'>>();
    const sessionDateMap = new Map<number, string>();
    const sessionLeagueMap = new Map<number, Id<'leagues'>>();

    for (const row of args.weeks) {
      await ctx.db.insert('importRawWeeks', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });

      if (!row.leagueFk) {
        importWarnings.push({
          recordType: 'session',
          recordId: String(row.sqliteId),
          message: 'week is missing leagueFk and was skipped',
        });
        continue;
      }

      const leagueId = leagueIdMap.get(row.leagueFk);

      if (!leagueId) {
        importWarnings.push({
          recordType: 'session',
          recordId: String(row.sqliteId),
          message: `week leagueFk ${String(row.leagueFk)} was not imported`,
        });
        continue;
      }

      const weekDate = normalizeDate(
        row.date,
        `week ${String(row.sqliteId)}`,
        today
      );

      if (weekDate.warning) {
        importWarnings.push({
          recordType: 'session',
          recordId: String(row.sqliteId),
          message: weekDate.warning,
        });
      }

      const sessionId = await ctx.db.insert('sessions', {
        userId,
        leagueId,
        weekNumber: null,
        date: weekDate.date,
        houseId: row.houseFk ? (houseIdMap.get(row.houseFk) ?? null) : null,
        ballId: row.ballFk ? (ballIdMap.get(row.ballFk) ?? null) : null,
        patternId: row.patternFk
          ? (patternIdMap.get(row.patternFk) ?? null)
          : null,
        notes: null,
        laneContext: null,
      });
      sessionIdMap.set(row.sqliteId, sessionId);
      sessionDateMap.set(row.sqliteId, weekDate.date);
      sessionLeagueMap.set(row.sqliteId, leagueId);
    }

    const gameIdMap = new Map<number, Id<'games'>>();

    for (const row of args.games) {
      await ctx.db.insert('importRawGames', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });

      if (!row.weekFk) {
        importWarnings.push({
          recordType: 'game',
          recordId: String(row.sqliteId),
          message: 'game is missing weekFk and was skipped',
        });
        continue;
      }

      const sessionId = sessionIdMap.get(row.weekFk);

      if (!sessionId) {
        importWarnings.push({
          recordType: 'game',
          recordId: String(row.sqliteId),
          message: `game weekFk ${String(row.weekFk)} was not imported`,
        });
        continue;
      }

      const leagueId =
        (row.leagueFk ? leagueIdMap.get(row.leagueFk) : undefined) ??
        sessionLeagueMap.get(row.weekFk);

      if (!leagueId) {
        importWarnings.push({
          recordType: 'game',
          recordId: String(row.sqliteId),
          message: 'game could not resolve leagueId and was skipped',
        });
        continue;
      }

      const gameDate = normalizeDate(
        row.date,
        `game ${String(row.sqliteId)}`,
        sessionDateMap.get(row.weekFk) ?? today
      );

      if (gameDate.warning) {
        importWarnings.push({
          recordType: 'game',
          recordId: String(row.sqliteId),
          message: gameDate.warning,
        });
      }

      const gameId = await ctx.db.insert('games', {
        userId,
        sessionId,
        leagueId,
        date: gameDate.date,
        totalScore: normalizeNullableInteger(row.score, 0, 400) ?? 0,
        strikes: 0,
        spares: 0,
        opens: 0,
        ballId: row.ballFk ? (ballIdMap.get(row.ballFk) ?? null) : null,
        patternId: row.patternFk
          ? (patternIdMap.get(row.patternFk) ?? null)
          : null,
        houseId: row.houseFk ? (houseIdMap.get(row.houseFk) ?? null) : null,
        handicap: null,
        notes: null,
        laneContext: null,
        ballSwitches: null,
      });
      gameIdMap.set(row.sqliteId, gameId);
    }

    const framesByGame = new Map<number, typeof args.frames>();

    for (const row of args.frames) {
      await ctx.db.insert('importRawFrames', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });

      if (!row.gameFk) {
        continue;
      }

      const existing = framesByGame.get(row.gameFk);

      if (existing) {
        existing.push(row);
      } else {
        framesByGame.set(row.gameFk, [row]);
      }
    }

    const sessionRefinements: SessionRefinementInput[] = [];

    for (const week of args.weeks) {
      const sessionId = sessionIdMap.get(week.sqliteId);

      if (!sessionId) {
        continue;
      }

      const notes = normalizeOptionalText(week.notes);
      const laneContext = laneContextFromLane(week.lane);

      if (notes === null && laneContext === null) {
        continue;
      }

      sessionRefinements.push({
        sessionId,
        notes,
        laneContext,
      });
    }

    const gameRefinements: GameRefinementInput[] = [];

    for (const gameRow of args.games) {
      const gameId = gameIdMap.get(gameRow.sqliteId);

      if (!gameId) {
        continue;
      }

      const laneContext = laneContextFromLane(gameRow.lane);
      const notes = normalizeOptionalText(gameRow.notes);
      const rawFrames = framesByGame.get(gameRow.sqliteId) ?? [];
      const sortedFrames = [...rawFrames].sort((left, right) => {
        const leftFrame = left.frameNum ?? Number.MAX_SAFE_INTEGER;
        const rightFrame = right.frameNum ?? Number.MAX_SAFE_INTEGER;

        if (leftFrame !== rightFrame) {
          return leftFrame - rightFrame;
        }

        return left.sqliteId - right.sqliteId;
      });

      const ballSwitches: BallSwitchInput[] = [];
      let activeBallId = gameRow.ballFk
        ? (ballIdMap.get(gameRow.ballFk) ?? null)
        : null;

      for (const frame of sortedFrames) {
        if (!frame.ballFk) {
          continue;
        }

        const frameNumber = normalizeNullableInteger(frame.frameNum, 1, 10);

        if (frameNumber === null) {
          importWarnings.push({
            recordType: 'game',
            recordId: String(gameId),
            message: `frame ${String(frame.sqliteId)} has invalid frameNum for ball switch derivation`,
          });
          continue;
        }

        const nextBallId = ballIdMap.get(frame.ballFk) ?? null;

        if (nextBallId === activeBallId) {
          continue;
        }

        ballSwitches.push({
          frameNumber,
          rollNumber: null,
          ballId: nextBallId,
          ballName: ballNameBySqlite.get(frame.ballFk) ?? null,
          note: null,
        });
        activeBallId = nextBallId;
      }

      gameRefinements.push({
        gameId,
        handicap: null,
        notes,
        laneContext,
        ballSwitches: ballSwitches.length > 0 ? ballSwitches : null,
      });
    }

    if (args.games.length > 0) {
      importWarnings.push({
        recordType: 'game',
        recordId: 'all',
        message:
          'handicap source mapping is unresolved for this SQLite variant; handicap stored as null',
      });
    }

    const refinementResult = await applyRefinement(ctx, userId, {
      sessions: sessionRefinements,
      games: gameRefinements,
    });

    const warnings = [...importWarnings, ...refinementResult.warnings];

    await ctx.db.patch(batchId, {
      status: 'completed',
      completedAt: Date.now(),
      counts: {
        houses: args.houses.length,
        leagues: args.leagues.length,
        weeks: args.weeks.length,
        sessions: sessionIdMap.size,
        balls: args.balls.length,
        games: gameIdMap.size,
        frames: args.frames.length,
        patterns: args.patterns.length,
        gamesRefined: refinementResult.gamesProcessed,
        gamesPatched: refinementResult.gamesPatched,
        warnings: warnings.length,
      },
    });

    return {
      batchId,
      counts: {
        houses: args.houses.length,
        leagues: args.leagues.length,
        weeks: args.weeks.length,
        sessions: sessionIdMap.size,
        balls: args.balls.length,
        games: gameIdMap.size,
        frames: args.frames.length,
        patterns: args.patterns.length,
      },
      refinement: refinementResult,
      warnings,
    };
  },
});
