import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,
  leagues: defineTable({
    userId: v.id('users'),
    name: v.string(),
    clientSyncId: v.optional(v.union(v.string(), v.null())),
    gamesPerSession: v.optional(v.union(v.number(), v.null())),
    houseId: v.optional(v.union(v.id('houses'), v.null())),
    houseName: v.optional(v.union(v.string(), v.null())),
    startDate: v.optional(v.union(v.string(), v.null())),
    endDate: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_user_house', ['userId', 'houseId']),
  sessions: defineTable({
    userId: v.id('users'),
    leagueId: v.id('leagues'),
    clientSyncId: v.optional(v.union(v.string(), v.null())),
    weekNumber: v.optional(v.union(v.number(), v.null())),
    date: v.string(),
    houseId: v.optional(v.union(v.id('houses'), v.null())),
    ballId: v.optional(v.union(v.id('balls'), v.null())),
    patternId: v.optional(v.union(v.id('patterns'), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    laneContext: v.optional(
      v.union(
        v.object({
          leftLane: v.optional(v.union(v.number(), v.null())),
          rightLane: v.optional(v.union(v.number(), v.null())),
          lanePair: v.optional(v.union(v.string(), v.null())),
          startingLane: v.optional(v.union(v.number(), v.null())),
        }),
        v.null()
      )
    ),
  })
    .index('by_user', ['userId'])
    .index('by_league', ['leagueId'])
    .index('by_user_league', ['userId', 'leagueId']),
  games: defineTable({
    userId: v.id('users'),
    sessionId: v.id('sessions'),
    leagueId: v.id('leagues'),
    clientSyncId: v.optional(v.union(v.string(), v.null())),
    date: v.string(),
    totalScore: v.number(),
    strikes: v.number(),
    spares: v.number(),
    opens: v.number(),
    ballId: v.optional(v.union(v.id('balls'), v.null())),
    patternId: v.optional(v.union(v.id('patterns'), v.null())),
    handicap: v.optional(v.union(v.number(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    laneContext: v.optional(
      v.union(
        v.object({
          leftLane: v.optional(v.union(v.number(), v.null())),
          rightLane: v.optional(v.union(v.number(), v.null())),
          lanePair: v.optional(v.union(v.string(), v.null())),
          startingLane: v.optional(v.union(v.number(), v.null())),
        }),
        v.null()
      )
    ),
    ballSwitches: v.optional(
      v.union(
        v.array(
          v.object({
            frameNumber: v.number(),
            rollNumber: v.optional(v.union(v.number(), v.null())),
            ballId: v.optional(v.union(v.id('balls'), v.null())),
            ballName: v.optional(v.union(v.string(), v.null())),
            note: v.optional(v.union(v.string(), v.null())),
          })
        ),
        v.null()
      )
    ),
    framePreview: v.optional(
      v.union(
        v.array(
          v.object({
            text: v.string(),
            hasSplit: v.boolean(),
          })
        ),
        v.null()
      )
    ),
  })
    .index('by_user', ['userId'])
    .index('by_session', ['sessionId'])
    .index('by_league', ['leagueId'])
    .index('by_user_session', ['userId', 'sessionId']),
  frames: defineTable({
    userId: v.id('users'),
    gameId: v.id('games'),
    frameNumber: v.number(),
    roll1: v.number(),
    roll2: v.optional(v.union(v.number(), v.null())),
    roll3: v.optional(v.union(v.number(), v.null())),
    ballId: v.optional(v.union(v.id('balls'), v.null())),
    pins: v.optional(v.union(v.number(), v.null())),
    scores: v.optional(v.union(v.number(), v.null())),
    score: v.optional(v.union(v.number(), v.null())),
    flags: v.optional(v.union(v.number(), v.null())),
    pocket: v.optional(v.union(v.number(), v.null())),
    footBoard: v.optional(v.union(v.number(), v.null())),
    targetBoard: v.optional(v.union(v.number(), v.null())),
  })
    .index('by_game', ['gameId'])
    .index('by_user_game', ['userId', 'gameId']),
  balls: defineTable({
    userId: v.id('users'),
    name: v.string(),
    brand: v.optional(v.union(v.string(), v.null())),
    coverstock: v.optional(v.union(v.string(), v.null())),
  })
    .index('by_user', ['userId'])
    .index('by_user_name', ['userId', 'name']),
  houses: defineTable({
    name: v.string(),
    location: v.optional(v.union(v.string(), v.null())),
  }).index('by_name', ['name']),
  patterns: defineTable({
    name: v.string(),
    length: v.optional(v.union(v.number(), v.null())),
  }).index('by_name', ['name']),
  importBatches: defineTable({
    userId: v.id('users'),
    sourceType: v.string(),
    r2Key: v.optional(v.union(v.string(), v.null())),
    sourceFileName: v.optional(v.union(v.string(), v.null())),
    fileSize: v.optional(v.union(v.number(), v.null())),
    sourceHash: v.optional(v.union(v.string(), v.null())),
    idempotencyKey: v.optional(v.union(v.string(), v.null())),
    status: v.string(),
    errorMessage: v.optional(v.union(v.string(), v.null())),
    importedAt: v.number(),
    completedAt: v.optional(v.union(v.number(), v.null())),
    counts: v.object({
      houses: v.number(),
      leagues: v.number(),
      weeks: v.number(),
      sessions: v.number(),
      balls: v.number(),
      games: v.number(),
      frames: v.number(),
      patterns: v.number(),
      gamesRefined: v.number(),
      gamesPatched: v.number(),
      warnings: v.number(),
    }),
  })
    .index('by_user', ['userId'])
    .index('by_user_imported_at', ['userId', 'importedAt'])
    .index('by_user_status', ['userId', 'status'])
    .index('by_user_idempotency', ['userId', 'idempotencyKey']),
  importRawHouses: defineTable({
    userId: v.id('users'),
    batchId: v.id('importBatches'),
    sqliteId: v.number(),
    raw: v.object({
      sqliteId: v.number(),
      name: v.optional(v.union(v.string(), v.null())),
      sortOrder: v.optional(v.union(v.number(), v.null())),
      flags: v.optional(v.union(v.number(), v.null())),
      location: v.optional(v.union(v.string(), v.null())),
    }),
    importedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_batch', ['batchId'])
    .index('by_user_sqlite_id', ['userId', 'sqliteId']),
  importRawPatterns: defineTable({
    userId: v.id('users'),
    batchId: v.id('importBatches'),
    sqliteId: v.number(),
    raw: v.object({
      sqliteId: v.number(),
      name: v.optional(v.union(v.string(), v.null())),
      sortOrder: v.optional(v.union(v.number(), v.null())),
      flags: v.optional(v.union(v.number(), v.null())),
      length: v.optional(v.union(v.number(), v.null())),
    }),
    importedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_batch', ['batchId'])
    .index('by_user_sqlite_id', ['userId', 'sqliteId']),
  importRawBalls: defineTable({
    userId: v.id('users'),
    batchId: v.id('importBatches'),
    sqliteId: v.number(),
    raw: v.object({
      sqliteId: v.number(),
      name: v.optional(v.union(v.string(), v.null())),
      sortOrder: v.optional(v.union(v.number(), v.null())),
      flags: v.optional(v.union(v.number(), v.null())),
      brand: v.optional(v.union(v.string(), v.null())),
      coverstock: v.optional(v.union(v.string(), v.null())),
    }),
    importedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_batch', ['batchId'])
    .index('by_user_sqlite_id', ['userId', 'sqliteId']),
  importRawLeagues: defineTable({
    userId: v.id('users'),
    batchId: v.id('importBatches'),
    sqliteId: v.number(),
    raw: v.object({
      sqliteId: v.number(),
      ballFk: v.optional(v.union(v.number(), v.null())),
      patternFk: v.optional(v.union(v.number(), v.null())),
      houseFk: v.optional(v.union(v.number(), v.null())),
      name: v.optional(v.union(v.string(), v.null())),
      games: v.optional(v.union(v.number(), v.null())),
      notes: v.optional(v.union(v.string(), v.null())),
      sortOrder: v.optional(v.union(v.number(), v.null())),
      flags: v.optional(v.union(v.number(), v.null())),
    }),
    importedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_batch', ['batchId'])
    .index('by_user_sqlite_id', ['userId', 'sqliteId']),
  importRawWeeks: defineTable({
    userId: v.id('users'),
    batchId: v.id('importBatches'),
    sqliteId: v.number(),
    raw: v.object({
      sqliteId: v.number(),
      leagueFk: v.optional(v.union(v.number(), v.null())),
      ballFk: v.optional(v.union(v.number(), v.null())),
      patternFk: v.optional(v.union(v.number(), v.null())),
      houseFk: v.optional(v.union(v.number(), v.null())),
      date: v.optional(v.union(v.number(), v.string(), v.null())),
      notes: v.optional(v.union(v.string(), v.null())),
      lane: v.optional(v.union(v.number(), v.null())),
    }),
    importedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_batch', ['batchId'])
    .index('by_user_sqlite_id', ['userId', 'sqliteId']),
  importRawGames: defineTable({
    userId: v.id('users'),
    batchId: v.id('importBatches'),
    sqliteId: v.number(),
    raw: v.object({
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
    }),
    importedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_batch', ['batchId'])
    .index('by_user_sqlite_id', ['userId', 'sqliteId']),
  importRawFrames: defineTable({
    userId: v.id('users'),
    batchId: v.id('importBatches'),
    sqliteId: v.number(),
    raw: v.object({
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
    }),
    importedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_batch', ['batchId'])
    .index('by_user_sqlite_id', ['userId', 'sqliteId']),
  importCallbackNonces: defineTable({
    nonce: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_nonce', ['nonce'])
    .index('by_expires_at', ['expiresAt']),
  referenceUsage: defineTable({
    userId: v.id('users'),
    referenceType: v.union(
      v.literal('ball'),
      v.literal('pattern'),
      v.literal('house')
    ),
    referenceId: v.string(),
    lastUsedAt: v.number(),
  })
    .index('by_user_type_last_used', ['userId', 'referenceType', 'lastUsedAt'])
    .index('by_user_type_ref', ['userId', 'referenceType', 'referenceId']),
});
