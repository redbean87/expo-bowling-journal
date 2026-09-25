/**
 * Canonical local SQLite schema (A3).
 *
 * This module is PURE: it exports only the DDL for the seven canonical bowling
 * entities and has NO runtime dependencies (no `expo-sqlite`, no Convex, no
 * services). The lifecycle boundary in {@link ./database} runs this DDL as its
 * version-2 migration, and a focused schema check can apply the exact same DDL
 * against a standalone SQLite engine without touching the app runtime.
 *
 * Identity and representation
 * - Primary keys are local UUIDs (TEXT). They are the canonical identifiers;
 *   PinPal/Convex IDs are never stored here.
 * - Frames store the authoritative per-frame mask representation: `roll1Mask`,
 *   `roll2Mask`, `roll3Mask`. PinPal's packed `pins`, its numeric
 *   `roll1/roll2/roll3`, and any derived scores/statistics are NOT stored;
 *   those are computed from the masks on demand.
 * - `metadata` columns are optional JSON (`Record<string, unknown> | null`),
 *   stored as TEXT. `laneContext` and `ballSwitches` are structured values and
 *   are likewise stored as-is in TEXT (JSON).
 *
 * Hierarchy: League -> Session -> Game -> Frame
 * - `sessions.leagueId` is nullable: NULL = open/casual bowling, non-NULL = a
 *   league session. There is no synthetic "Open Bowling" league.
 * - A Game always belongs to a Session (`games.sessionId` is NOT NULL).
 * - A Frame always belongs to a Game (`frames.gameId` is NOT NULL).
 * - Ball, House, and Pattern are reference entities referenced by nullable
 *   foreign keys.
 */
export const CANONICAL_SCHEMA_SQL = `
-- Reference entities (leaves of the relationship graph).
CREATE TABLE IF NOT EXISTS balls (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  brand       TEXT,
  coverstock  TEXT,
  metadata    TEXT
);

CREATE TABLE IF NOT EXISTS houses (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  location   TEXT,
  metadata   TEXT
);

CREATE TABLE IF NOT EXISTS patterns (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  length   REAL,
  metadata TEXT
);

-- Hierarchy: League -> Session -> Game -> Frame.
CREATE TABLE IF NOT EXISTS leagues (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  gamesPerSession INTEGER,
  houseId         TEXT REFERENCES houses(id),
  startDate       INTEGER,
  endDate         INTEGER,
  metadata        TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  leagueId    TEXT REFERENCES leagues(id),
  date        INTEGER NOT NULL,
  weekNumber  INTEGER,
  houseId     TEXT REFERENCES houses(id),
  ballId      TEXT REFERENCES balls(id),
  patternId   TEXT REFERENCES patterns(id),
  notes       TEXT,
  laneContext TEXT,
  metadata    TEXT
);

CREATE TABLE IF NOT EXISTS games (
  id           TEXT PRIMARY KEY,
  sessionId    TEXT NOT NULL REFERENCES sessions(id),
  date         INTEGER NOT NULL,
  houseId      TEXT REFERENCES houses(id),
  ballId       TEXT REFERENCES balls(id),
  patternId    TEXT REFERENCES patterns(id),
  handicap     REAL,
  notes        TEXT,
  laneContext  TEXT,
  ballSwitches TEXT,
  metadata     TEXT
);

CREATE TABLE IF NOT EXISTS frames (
  id          TEXT PRIMARY KEY,
  gameId      TEXT NOT NULL REFERENCES games(id),
  frameNumber INTEGER NOT NULL,
  roll1Mask   INTEGER,
  roll2Mask   INTEGER,
  roll3Mask   INTEGER,
  ballId      TEXT REFERENCES balls(id),
  flags       INTEGER,
  pocket      INTEGER,
  footBoard   INTEGER,
  targetBoard INTEGER,
  metadata    TEXT
);

-- Indexes for the canonical hierarchy (League -> Session -> Game -> Frame).
CREATE INDEX IF NOT EXISTS ix_sessions_leagueId ON sessions (leagueId);
CREATE INDEX IF NOT EXISTS ix_games_sessionId   ON games (sessionId);
CREATE INDEX IF NOT EXISTS ix_frames_gameId     ON frames (gameId);

-- Indexes for common reference-relationship lookups (Ball / House / Pattern).
CREATE INDEX IF NOT EXISTS ix_leagues_houseId    ON leagues (houseId);
CREATE INDEX IF NOT EXISTS ix_sessions_houseId   ON sessions (houseId);
CREATE INDEX IF NOT EXISTS ix_sessions_ballId    ON sessions (ballId);
CREATE INDEX IF NOT EXISTS ix_sessions_patternId ON sessions (patternId);
CREATE INDEX IF NOT EXISTS ix_games_houseId      ON games (houseId);
CREATE INDEX IF NOT EXISTS ix_games_ballId       ON games (ballId);
CREATE INDEX IF NOT EXISTS ix_games_patternId    ON games (patternId);
CREATE INDEX IF NOT EXISTS ix_frames_ballId      ON frames (ballId);
`;
