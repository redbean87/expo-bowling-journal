import { ConvexError } from 'convex/values';

import {
  clearUserImportDataInChunks,
  deleteUserDocsChunkForImportTable,
} from './import_replace_all_cleanup';
import {
  buildLeagueCreatedAtByEarliestWeekDate,
  normalizeImportDateStrict,
  normalizeTimezoneOffsetMinutes,
} from './import_dates';
import {
  buildImportedGameFramePreview,
  computeImportedGameStats,
} from './import_game_stats';
import {
  laneContextFromLane,
  normalizeNullableInteger,
  normalizeOptionalText,
  type BallSwitchInput,
} from './import_refinement';
import { summarizeImportWarnings } from './import_warning_summary';
import {
  DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE,
  EMPTY_IMPORT_COUNTS,
  type GameRefinementInput,
  type RefinementResult,
  type RefinementWarning,
  type SessionRefinementInput,
  type SnapshotImportCoreResult,
  type SqliteSnapshotInput,
} from './import_types';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

type RunSqliteSnapshotImportCoreOptions = {
  skipReplaceAllCleanup?: boolean;
  skipRawMirrorPersistence?: boolean;
  timezoneOffsetMinutes?: number | null;
};

type RunSqliteSnapshotImportCoreDependencies = {
  applyRefinement: (
    ctx: MutationCtx,
    userId: Id<'users'>,
    args: {
      sessions: SessionRefinementInput[];
      games: GameRefinementInput[];
    }
  ) => Promise<RefinementResult>;
};

function normalizeName(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value, 120);
  return normalized;
}

function normalizeDate(
  value: number | string | null | undefined,
  label: string,
  fallbackDate: string,
  timezoneOffsetMinutes: number | null
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

  const normalizedDate = normalizeImportDateStrict(
    value,
    timezoneOffsetMinutes
  );

  if (!normalizedDate) {
    return {
      date: fallbackDate,
      warning: `${label}: invalid numeric date, used fallback`,
    };
  }

  return {
    date: normalizedDate,
    warning: null,
  };
}

export async function runSqliteSnapshotImportCore(
  ctx: MutationCtx,
  userId: Id<'users'>,
  args: SqliteSnapshotInput,
  existingBatchId: Id<'importBatches'> | undefined,
  options: RunSqliteSnapshotImportCoreOptions | undefined,
  deps: RunSqliteSnapshotImportCoreDependencies
): Promise<SnapshotImportCoreResult> {
  const importedAt = Date.now();
  const timezoneOffsetMinutes = normalizeTimezoneOffsetMinutes(
    options?.timezoneOffsetMinutes
  );
  const today =
    normalizeImportDateStrict(importedAt, timezoneOffsetMinutes) ??
    new Date(importedAt).toISOString().slice(0, 10);
  const importWarnings: RefinementWarning[] = [];
  const shouldPersistRawMirrors = !options?.skipRawMirrorPersistence;

  if (!options?.skipReplaceAllCleanup) {
    await clearUserImportDataInChunks((table) =>
      deleteUserDocsChunkForImportTable(
        ctx,
        userId,
        table,
        DEFAULT_REPLACE_ALL_DELETE_CHUNK_SIZE
      )
    );
  }

  let batchId: Id<'importBatches'>;

  if (existingBatchId) {
    const existingBatch = await ctx.db.get(existingBatchId);

    if (!existingBatch || existingBatch.userId !== userId) {
      throw new ConvexError('Import batch not found for user');
    }

    await ctx.db.patch(existingBatchId, {
      sourceType: 'sqlite',
      sourceFileName:
        normalizeOptionalText(args.sourceFileName, 255) ??
        existingBatch.sourceFileName ??
        null,
      sourceHash:
        normalizeOptionalText(args.sourceHash, 128) ??
        existingBatch.sourceHash ??
        null,
      status: 'importing',
      errorMessage: null,
      completedAt: null,
      counts: { ...EMPTY_IMPORT_COUNTS },
    });
    batchId = existingBatchId;
  } else {
    batchId = await ctx.db.insert('importBatches', {
      userId,
      sourceType: 'sqlite',
      r2Key: null,
      sourceFileName: normalizeOptionalText(args.sourceFileName, 255),
      fileSize: null,
      sourceHash: normalizeOptionalText(args.sourceHash, 128),
      idempotencyKey: null,
      status: 'importing',
      errorMessage: null,
      importedAt,
      completedAt: null,
      counts: { ...EMPTY_IMPORT_COUNTS },
    });
  }

  const houseIdMap = new Map<number, Id<'houses'>>();
  const houseByName = new Map<string, Id<'houses'>>();

  for (const row of args.houses) {
    if (shouldPersistRawMirrors) {
      await ctx.db.insert('importRawHouses', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });
    }

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
    if (shouldPersistRawMirrors) {
      await ctx.db.insert('importRawPatterns', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });
    }

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
    if (shouldPersistRawMirrors) {
      await ctx.db.insert('importRawBalls', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });
    }

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
      .withIndex('by_user_name', (q) => q.eq('userId', userId).eq('name', name))
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
  const leagueCreatedAtBySqliteId = buildLeagueCreatedAtByEarliestWeekDate(
    args.weeks,
    timezoneOffsetMinutes
  );

  for (const row of args.leagues) {
    if (shouldPersistRawMirrors) {
      await ctx.db.insert('importRawLeagues', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });
    }

    const name =
      normalizeName(row.name) ?? `Imported League ${String(row.sqliteId)}`;
    const houseId = row.houseFk ? (houseIdMap.get(row.houseFk) ?? null) : null;
    const houseName = houseId
      ? ((await ctx.db.get(houseId))?.name ?? null)
      : null;
    const leagueId = await ctx.db.insert('leagues', {
      userId,
      name,
      gamesPerSession: normalizeNullableInteger(row.games, 1, 12),
      houseId,
      houseName,
      startDate: null,
      endDate: null,
      createdAt: leagueCreatedAtBySqliteId.get(row.sqliteId) ?? importedAt,
    });
    leagueIdMap.set(row.sqliteId, leagueId);
  }

  const sessionIdMap = new Map<number, Id<'sessions'>>();
  const sessionDateMap = new Map<number, string>();
  const sessionLeagueMap = new Map<number, Id<'leagues'>>();

  for (const row of args.weeks) {
    if (shouldPersistRawMirrors) {
      await ctx.db.insert('importRawWeeks', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });
    }

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
      today,
      timezoneOffsetMinutes
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
  const framesByGame = new Map<number, typeof args.frames>();

  for (const row of args.frames) {
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

  for (const row of args.games) {
    if (shouldPersistRawMirrors) {
      await ctx.db.insert('importRawGames', {
        userId,
        batchId,
        sqliteId: row.sqliteId,
        raw: row,
        importedAt,
      });
    }

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
      sessionDateMap.get(row.weekFk) ?? today,
      timezoneOffsetMinutes
    );

    if (gameDate.warning) {
      importWarnings.push({
        recordType: 'game',
        recordId: String(row.sqliteId),
        message: gameDate.warning,
      });
    }

    const fallbackScore = normalizeNullableInteger(row.score, 0, 400) ?? 0;
    const computedStats = computeImportedGameStats(
      framesByGame.get(row.sqliteId) ?? [],
      fallbackScore
    );
    const framePreview = buildImportedGameFramePreview(
      framesByGame.get(row.sqliteId) ?? []
    );

    const gameId = await ctx.db.insert('games', {
      userId,
      sessionId,
      leagueId,
      date: gameDate.date,
      totalScore: computedStats.totalScore,
      strikes: computedStats.strikes,
      spares: computedStats.spares,
      opens: computedStats.opens,
      framePreview,
      ballId: row.ballFk ? (ballIdMap.get(row.ballFk) ?? null) : null,
      patternId: row.patternFk
        ? (patternIdMap.get(row.patternFk) ?? null)
        : null,
      handicap: null,
      notes: null,
      laneContext: null,
      ballSwitches: null,
    });
    gameIdMap.set(row.sqliteId, gameId);
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

  const refinementResult = await deps.applyRefinement(ctx, userId, {
    sessions: sessionRefinements,
    games: gameRefinements,
  });

  const warnings = summarizeImportWarnings([
    ...importWarnings,
    ...refinementResult.warnings,
  ]);

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
    gameIdMappings: [...gameIdMap.entries()].map(([sqliteGameId, gameId]) => ({
      sqliteGameId,
      gameId,
    })),
    ballIdMappings: [...ballIdMap.entries()].map(([sqliteBallId, ballId]) => ({
      sqliteBallId,
      ballId,
    })),
  };
}
