import { v } from 'convex/values';

import { query } from './_generated/server';
import { requireUserId } from './lib/auth';
import {
  countLegacyRowsForGameFrames,
  frameHasSpare,
  packPinsFromRolls,
  toLegacyPackedPins,
  type ExportableFrameDoc,
} from './lib/sqlite_export_frame_encoding';

type SqliteHouseRow = {
  sqliteId: number;
  name: string | null;
  sortOrder: number | null;
  flags: number | null;
  location: string | null;
};

type SqlitePatternRow = {
  sqliteId: number;
  name: string | null;
  sortOrder: number | null;
  flags: number | null;
  length: number | null;
};

type SqliteBallRow = {
  sqliteId: number;
  name: string | null;
  sortOrder: number | null;
  flags: number | null;
  brand: string | null;
  coverstock: string | null;
};

type SqliteLeagueRow = {
  sqliteId: number;
  ballFk: number | null;
  patternFk: number | null;
  houseFk: number | null;
  name: string | null;
  games: number | null;
  notes: string | null;
  sortOrder: number | null;
  flags: number | null;
};

type SqliteWeekRow = {
  sqliteId: number;
  leagueFk: number | null;
  ballFk: number | null;
  patternFk: number | null;
  houseFk: number | null;
  date: string | null;
  notes: string | null;
  lane: number | null;
};

type SqliteGameRow = {
  sqliteId: number;
  weekFk: number | null;
  leagueFk: number | null;
  ballFk: number | null;
  patternFk: number | null;
  houseFk: number | null;
  score: number | null;
  frame: number | null;
  flags: number | null;
  singlePinSpareScore: number | null;
  notes: string | null;
  lane: number | null;
  date: string | null;
};

type SqliteFrameRow = {
  sqliteId: number;
  gameFk: number | null;
  weekFk: number | null;
  leagueFk: number | null;
  ballFk: number | null;
  frameNum: number | null;
  pins: number | null;
  scores: number | null;
  score: number | null;
  flags: number | null;
  pocket: number | null;
  footBoard: number | null;
  targetBoard: number | null;
};

type ExportableStoredFrame = ExportableFrameDoc & {
  ballId?: string | null;
  scores?: number | null;
  score?: number | null;
  flags?: number | null;
  pocket?: number | null;
  footBoard?: number | null;
  targetBoard?: number | null;
};

type ExportContext = {
  sortedGames: Array<Record<string, unknown>>;
  gameSqliteIdById: Map<string, number>;
  weekSqliteIdById: Map<string, number>;
  leagueSqliteIdById: Map<string, number>;
  ballSqliteIdById: Map<string, number>;
};

const STRIKE_FLAG = 193;

function laneFromLaneContext(
  laneContext: {
    leftLane?: number | null;
    rightLane?: number | null;
    lanePair?: string | null;
    startingLane?: number | null;
  } | null
) {
  if (!laneContext) {
    return null;
  }

  return (
    laneContext.startingLane ??
    laneContext.leftLane ??
    laneContext.rightLane ??
    null
  );
}

function buildLegacyFrameRowsForGame({
  frames,
  gameFk,
  weekFk,
  leagueFk,
  ballSqliteIdById,
}: {
  frames: ExportableStoredFrame[];
  gameFk: number | null;
  weekFk: number | null;
  leagueFk: number | null;
  ballSqliteIdById: Map<string, number>;
}) {
  const byFrameNumber = new Map<number, ExportableFrameDoc>();

  for (const frame of frames) {
    byFrameNumber.set(frame.frameNumber, frame);
  }

  const rows: Array<Omit<SqliteFrameRow, 'sqliteId'>> = [];

  const pushFrameRow = ({
    frameNumber,
    roll1,
    roll2,
    source,
    forceGenerated,
  }: {
    frameNumber: number;
    roll1: number;
    roll2: number | null;
    source: ExportableStoredFrame | null;
    forceGenerated?: boolean;
  }) => {
    const effectiveSource = forceGenerated ? null : source;

    rows.push({
      gameFk,
      weekFk,
      leagueFk,
      ballFk: effectiveSource?.ballId
        ? (ballSqliteIdById.get(String(effectiveSource.ballId)) ?? null)
        : null,
      frameNum: frameNumber,
      pins:
        toLegacyPackedPins(effectiveSource?.pins) ??
        packPinsFromRolls(roll1, roll2 === null ? 0 : roll2),
      scores: effectiveSource?.scores ?? null,
      score: effectiveSource?.score ?? null,
      flags: effectiveSource?.flags ?? (roll1 === 10 ? STRIKE_FLAG : 1),
      pocket: effectiveSource?.pocket ?? null,
      footBoard: effectiveSource?.footBoard ?? null,
      targetBoard: effectiveSource?.targetBoard ?? null,
    });
  };

  for (let frameNumber = 1; frameNumber <= 9; frameNumber += 1) {
    const source = byFrameNumber.get(frameNumber);

    if (!source) {
      continue;
    }

    pushFrameRow({
      frameNumber,
      roll1: source.roll1,
      roll2: source.roll2 ?? null,
      source,
    });
  }

  const tenthFrame = byFrameNumber.get(10);

  if (!tenthFrame) {
    return rows;
  }

  pushFrameRow({
    frameNumber: 10,
    roll1: tenthFrame.roll1,
    roll2: tenthFrame.roll2 ?? null,
    source: tenthFrame,
  });

  if (tenthFrame.roll1 === 10) {
    if (tenthFrame.roll2 !== undefined && tenthFrame.roll2 !== null) {
      pushFrameRow({
        frameNumber: 10,
        roll1: tenthFrame.roll2,
        roll2: 0,
        source: null,
        forceGenerated: true,
      });
    }

    if (tenthFrame.roll3 !== undefined && tenthFrame.roll3 !== null) {
      pushFrameRow({
        frameNumber: 10,
        roll1: tenthFrame.roll3,
        roll2: 0,
        source: null,
        forceGenerated: true,
      });
    }

    return rows;
  }

  if (
    frameHasSpare(tenthFrame) &&
    tenthFrame.roll3 !== undefined &&
    tenthFrame.roll3 !== null
  ) {
    pushFrameRow({
      frameNumber: 10,
      roll1: tenthFrame.roll3,
      roll2: 0,
      source: null,
      forceGenerated: true,
    });
  }

  return rows;
}

function buildExportContext({
  games,
  sessions,
  leagues,
  balls,
}: {
  games: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  leagues: Array<Record<string, unknown>>;
  balls: Array<Record<string, unknown>>;
}): ExportContext {
  const sortedGames = [...games].sort((left, right) => {
    const leftSessionId = String((left.sessionId as string | null) ?? '');
    const rightSessionId = String((right.sessionId as string | null) ?? '');

    if (leftSessionId !== rightSessionId) {
      return leftSessionId.localeCompare(rightSessionId);
    }

    const leftCreatedAt = Number((left._creationTime as number | null) ?? 0);
    const rightCreatedAt = Number((right._creationTime as number | null) ?? 0);

    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }

    return String(left._id).localeCompare(String(right._id));
  });
  const sortedSessions = [...sessions].sort((left, right) => {
    const leftDate = String((left.date as string | null) ?? '');
    const rightDate = String((right.date as string | null) ?? '');

    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate);
    }

    return String(left._id).localeCompare(String(right._id));
  });
  const sortedLeagues = [...leagues].sort((left, right) => {
    const leftCreatedAt = Number((left.createdAt as number | null) ?? 0);
    const rightCreatedAt = Number((right.createdAt as number | null) ?? 0);

    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }

    return String(left._id).localeCompare(String(right._id));
  });
  const sortedBalls = [...balls].sort((left, right) =>
    String((left.name as string | null) ?? '').localeCompare(
      String((right.name as string | null) ?? '')
    )
  );

  const gameSqliteIdById = new Map<string, number>();
  sortedGames.forEach((game, index) => {
    gameSqliteIdById.set(String(game._id), index + 1);
  });
  const weekSqliteIdById = new Map<string, number>();
  sortedSessions.forEach((session, index) => {
    weekSqliteIdById.set(String(session._id), index + 1);
  });
  const leagueSqliteIdById = new Map<string, number>();
  sortedLeagues.forEach((league, index) => {
    leagueSqliteIdById.set(String(league._id), index + 1);
  });
  const ballSqliteIdById = new Map<string, number>();
  sortedBalls.forEach((ball, index) => {
    ballSqliteIdById.set(String(ball._id), index + 1);
  });

  return {
    sortedGames,
    gameSqliteIdById,
    weekSqliteIdById,
    leagueSqliteIdById,
    ballSqliteIdById,
  };
}

export const getSqliteBackupSnapshotBase = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    const [leagues, sessions, games, balls] = await Promise.all([
      ctx.db
        .query('leagues')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .collect(),
      ctx.db
        .query('sessions')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .collect(),
      ctx.db
        .query('games')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .collect(),
      ctx.db
        .query('balls')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .collect(),
    ]);
    const [houses, patterns] = await Promise.all([
      ctx.db.query('houses').collect(),
      ctx.db.query('patterns').collect(),
    ]);
    const totalFrames = (
      await Promise.all(
        games.map(async (game) => {
          const gameFrames = await ctx.db
            .query('frames')
            .withIndex('by_user_game', (q) =>
              q.eq('userId', userId).eq('gameId', game._id)
            )
            .collect();

          return countLegacyRowsForGameFrames(
            gameFrames.map((frame) => ({
              frameNumber: frame.frameNumber,
              roll1: frame.roll1,
              roll2: frame.roll2 ?? null,
              roll3: frame.roll3 ?? null,
            }))
          );
        })
      )
    ).reduce((sum, count) => sum + count, 0);

    const houseIds = new Set<string>();
    const patternIds = new Set<string>();

    for (const league of leagues) {
      if (league.houseId) {
        houseIds.add(String(league.houseId));
      }
    }

    for (const session of sessions) {
      if (session.houseId) {
        houseIds.add(String(session.houseId));
      }

      if (session.patternId) {
        patternIds.add(String(session.patternId));
      }
    }

    for (const game of games) {
      if (game.patternId) {
        patternIds.add(String(game.patternId));
      }
    }

    const includedHouses = houses
      .filter((house) => houseIds.has(String(house._id)))
      .sort((left, right) => left.name.localeCompare(right.name));
    const includedPatterns = patterns
      .filter((pattern) => patternIds.has(String(pattern._id)))
      .sort((left, right) => left.name.localeCompare(right.name));
    const includedBalls = [...balls].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    const sortedLeagues = [...leagues].sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt - right.createdAt;
      }

      return String(left._id).localeCompare(String(right._id));
    });
    const sortedSessions = [...sessions].sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }

      return String(left._id).localeCompare(String(right._id));
    });
    const exportContext = buildExportContext({
      games: games as Array<Record<string, unknown>>,
      sessions: sessions as Array<Record<string, unknown>>,
      leagues: leagues as Array<Record<string, unknown>>,
      balls: balls as Array<Record<string, unknown>>,
    });
    const gameById = new Map(
      games.map((game) => [String(game._id), game] as const)
    );
    const sortedGames = exportContext.sortedGames
      .map((game) => gameById.get(String(game._id)))
      .filter((game): game is (typeof games)[number] => game !== undefined);

    const houseSqliteIdById = new Map<string, number>();
    includedHouses.forEach((house, index) => {
      houseSqliteIdById.set(String(house._id), index + 1);
    });
    const patternSqliteIdById = new Map<string, number>();
    includedPatterns.forEach((pattern, index) => {
      patternSqliteIdById.set(String(pattern._id), index + 1);
    });
    const ballSqliteIdById = exportContext.ballSqliteIdById;
    const leagueSqliteIdById = exportContext.leagueSqliteIdById;
    const weekSqliteIdById = exportContext.weekSqliteIdById;
    const gameSqliteIdById = exportContext.gameSqliteIdById;

    return {
      sourceFileName: null,
      sourceHash: null,
      houses: includedHouses.map(
        (house): SqliteHouseRow => ({
          sqliteId: houseSqliteIdById.get(String(house._id)) ?? 0,
          name: house.name ?? null,
          sortOrder: null,
          flags: null,
          location: house.location ?? null,
        })
      ),
      patterns: includedPatterns.map(
        (pattern): SqlitePatternRow => ({
          sqliteId: patternSqliteIdById.get(String(pattern._id)) ?? 0,
          name: pattern.name ?? null,
          sortOrder: null,
          flags: null,
          length: pattern.length ?? null,
        })
      ),
      balls: includedBalls.map(
        (ball): SqliteBallRow => ({
          sqliteId: ballSqliteIdById.get(String(ball._id)) ?? 0,
          name: ball.name ?? null,
          sortOrder: null,
          flags: null,
          brand: ball.brand ?? null,
          coverstock: ball.coverstock ?? null,
        })
      ),
      leagues: sortedLeagues.map(
        (league): SqliteLeagueRow => ({
          sqliteId: leagueSqliteIdById.get(String(league._id)) ?? 0,
          ballFk: null,
          patternFk: null,
          houseFk: league.houseId
            ? (houseSqliteIdById.get(String(league.houseId)) ?? null)
            : null,
          name: league.name ?? null,
          games: league.gamesPerSession ?? null,
          notes: null,
          sortOrder: null,
          flags: null,
        })
      ),
      weeks: sortedSessions.map(
        (session): SqliteWeekRow => ({
          sqliteId: weekSqliteIdById.get(String(session._id)) ?? 0,
          leagueFk: leagueSqliteIdById.get(String(session.leagueId)) ?? null,
          ballFk: session.ballId
            ? (ballSqliteIdById.get(String(session.ballId)) ?? null)
            : null,
          patternFk: session.patternId
            ? (patternSqliteIdById.get(String(session.patternId)) ?? null)
            : null,
          houseFk: session.houseId
            ? (houseSqliteIdById.get(String(session.houseId)) ?? null)
            : null,
          date: session.date ?? null,
          notes: session.notes ?? null,
          lane: laneFromLaneContext(session.laneContext ?? null),
        })
      ),
      games: sortedGames.map(
        (game): SqliteGameRow => ({
          sqliteId: gameSqliteIdById.get(String(game._id)) ?? 0,
          weekFk: weekSqliteIdById.get(String(game.sessionId)) ?? null,
          leagueFk: leagueSqliteIdById.get(String(game.leagueId)) ?? null,
          ballFk: game.ballId
            ? (ballSqliteIdById.get(String(game.ballId)) ?? null)
            : null,
          patternFk: game.patternId
            ? (patternSqliteIdById.get(String(game.patternId)) ?? null)
            : null,
          houseFk: null,
          score: game.totalScore ?? null,
          frame: null,
          flags: null,
          singlePinSpareScore: null,
          notes: game.notes ?? null,
          lane: laneFromLaneContext(game.laneContext ?? null),
          date: game.date ?? null,
        })
      ),
      totalFrames,
      bjMeta: [
        { key: 'schemaVersion', value: '1' },
        { key: 'exportedAt', value: String(Date.now()) },
        { key: 'format', value: 'bowling-journal-sqlite-export' },
      ],
      bjSessionExt: sortedSessions.map((session) => ({
        weekFk: weekSqliteIdById.get(String(session._id)) ?? 0,
        laneContextJson: session.laneContext
          ? JSON.stringify(session.laneContext)
          : null,
        notesJson: session.notes ? JSON.stringify(session.notes) : null,
      })),
      bjGameExt: sortedGames.map((game) => ({
        gameFk: gameSqliteIdById.get(String(game._id)) ?? 0,
        laneContextJson: game.laneContext
          ? JSON.stringify(game.laneContext)
          : null,
        ballSwitchesJson: game.ballSwitches
          ? JSON.stringify(game.ballSwitches)
          : null,
        handicap: game.handicap ?? null,
        notesJson: game.notes ? JSON.stringify(game.notes) : null,
      })),
    };
  },
});

export const getSqliteBackupFramesChunk = query({
  args: {
    offset: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const offset = Math.max(0, Math.trunc(args.offset));
    const limit = Math.max(1, Math.min(2000, Math.trunc(args.limit)));

    const [leagues, sessions, games, balls] = await Promise.all([
      ctx.db
        .query('leagues')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .collect(),
      ctx.db
        .query('sessions')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .collect(),
      ctx.db
        .query('games')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .collect(),
      ctx.db
        .query('balls')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .collect(),
    ]);

    const exportContext = buildExportContext({
      games: games as Array<Record<string, unknown>>,
      sessions: sessions as Array<Record<string, unknown>>,
      leagues: leagues as Array<Record<string, unknown>>,
      balls: balls as Array<Record<string, unknown>>,
    });

    const allFrames = (
      await Promise.all(
        exportContext.sortedGames.map(async (game) => {
          const framesForGame = await ctx.db
            .query('frames')
            .withIndex('by_user_game', (q) =>
              q.eq('userId', userId).eq('gameId', game._id as never)
            )
            .collect();
          const gameFk =
            exportContext.gameSqliteIdById.get(String(game._id)) ?? null;
          const weekFk =
            exportContext.weekSqliteIdById.get(String(game.sessionId)) ?? null;
          const leagueFk =
            exportContext.leagueSqliteIdById.get(String(game.leagueId)) ?? null;

          return buildLegacyFrameRowsForGame({
            frames: framesForGame.map((frame) => ({
              frameNumber: frame.frameNumber,
              roll1: frame.roll1,
              roll2: frame.roll2 ?? null,
              roll3: frame.roll3 ?? null,
              ballId: frame.ballId ? String(frame.ballId) : null,
              pins: frame.pins ?? null,
              scores: frame.scores ?? null,
              score: frame.score ?? null,
              flags: frame.flags ?? null,
              pocket: frame.pocket ?? null,
              footBoard: frame.footBoard ?? null,
              targetBoard: frame.targetBoard ?? null,
            })),
            gameFk,
            weekFk,
            leagueFk,
            ballSqliteIdById: exportContext.ballSqliteIdById,
          });
        })
      )
    ).flat();

    const totalFrames = allFrames.length;
    const slice = allFrames.slice(offset, offset + limit);

    const frames = slice.map(
      (frame, index): SqliteFrameRow => ({
        sqliteId: offset + index + 1,
        ...frame,
      })
    );

    return {
      offset,
      limit,
      totalFrames,
      frames,
    };
  },
});
