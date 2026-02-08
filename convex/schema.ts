import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,
  leagues: defineTable({
    userId: v.id('users'),
    name: v.string(),
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
    weekNumber: v.optional(v.union(v.number(), v.null())),
    date: v.string(),
  })
    .index('by_user', ['userId'])
    .index('by_league', ['leagueId'])
    .index('by_user_league', ['userId', 'leagueId']),
  games: defineTable({
    userId: v.id('users'),
    sessionId: v.id('sessions'),
    leagueId: v.id('leagues'),
    date: v.string(),
    totalScore: v.number(),
    strikes: v.number(),
    spares: v.number(),
    opens: v.number(),
    ballId: v.optional(v.union(v.id('balls'), v.null())),
    patternId: v.optional(v.union(v.id('patterns'), v.null())),
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
});
