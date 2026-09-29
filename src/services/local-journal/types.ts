/**
 * Canonical domain types for the local (SQLite-backed) journal service.
 *
 * These types express the seven canonical entities (League, Session, Game,
 * Frame, Ball, Pattern, House), the service-level league summary, and the
 * input/filter shapes used by the local service's domain operations.
 *
 * They are intentionally independent of:
 *   - SQLite implementation details (no SQL, no column types, no JSON
 *     `metadata` catch-all),
 *   - Convex (no `Id<...>` / `Doc<...>` types),
 *   - authentication, network state, and the offline queue (no
 *     `clientSyncId`).
 *
 * Identity: every entity uses a local UUID (`string`) primary key. Convex and
 * PinPal IDs are never stored.
 *
 * Dates are ISO date strings (`YYYY-MM-DD`), matching the current app's domain
 * representation; the SQLite layer stores them as INTEGER timestamps (C2+).
 *
 * Rolls use the canonical authoritative 10-bit pin masks
 * (`roll1Mask`/`roll2Mask`/`roll3Mask`). The numeric `roll1`/`roll2`/`roll3`
 * and packed `pins` used by the current app are transport-only and are NOT
 * part of this contract.
 */

/** Local UUID primary key. */
export type Uuid = string;

/** Left/right lane context carried on sessions and games. */
export interface LaneContext {
  leftLane?: number | null;
  rightLane?: number | null;
  lanePair?: string | null;
  startingLane?: number | null;
}

/** A recorded ball switch within a game (frame/roll where the ball changed). */
export interface BallSwitch {
  frameNumber: number;
  rollNumber?: number | null;
  ballId?: Uuid | null;
  ballName?: string | null;
  note?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Canonical entities                                                          */
/* -------------------------------------------------------------------------- */

/** A bowling ball (reference data). */
export interface Ball {
  id: Uuid;
  name: string;
  brand?: string | null;
  coverstock?: string | null;
}

/** A bowling house / venue (reference data). */
export interface House {
  id: Uuid;
  name: string;
  location?: string | null;
}

/** A finger hole pattern (reference data). */
export interface Pattern {
  id: Uuid;
  name: string;
  length?: number | null;
}

/** A league (top of the hierarchy). */
export interface League {
  id: Uuid;
  name: string;
  gamesPerSession?: number | null;
  /** Canonical FK to the league's house (nullable). */
  houseId?: Uuid | null;
  /** Denormalized house name for display. */
  houseName?: string | null;
  /** ISO date string (`YYYY-MM-DD`). */
  startDate?: string | null;
  /** ISO date string (`YYYY-MM-DD`). */
  endDate?: string | null;
}

/**
 * Service-level league summary (derived, not persisted).
 *
 * The canonical {@link League} plus the derived `mostRecentSessionDate`
 * field: the ISO date of the league's most recent session, or `null` when
 * the league has no sessions. The service computes it from the league's
 * sessions so the UI does not need to fetch them itself; it is never
 * written to SQLite.
 */
export interface LeagueSummary extends League {
  /** Derived ISO date string (`YYYY-MM-DD`); `null` when the league has no sessions. */
  mostRecentSessionDate: string | null;
}

/**
 * A session (league session or open/casual session).
 *
 * `leagueId` is the nullable FK to a league:
 *   - a `Uuid`  → a league session,
 *   - `null`    → an open / casual session (no league).
 */
export interface Session {
  id: Uuid;
  leagueId: Uuid | null;
  /** ISO date string (`YYYY-MM-DD`). */
  date: string;
  weekNumber?: number | null;
  houseId?: Uuid | null;
  ballId?: Uuid | null;
  patternId?: Uuid | null;
  notes?: string | null;
  laneContext?: LaneContext | null;
}

/** A game (belongs to exactly one session). */
export interface Game {
  id: Uuid;
  sessionId: Uuid;
  /** ISO date string (`YYYY-MM-DD`). */
  date: string;
  houseId?: Uuid | null;
  ballId?: Uuid | null;
  patternId?: Uuid | null;
  handicap?: number | null;
  notes?: string | null;
  laneContext?: LaneContext | null;
  ballSwitches?: BallSwitch[] | null;
}

/**
 * A frame within a game.
 *
 * Rolls are the authoritative 10-bit pin masks. A frame has up to three roll
 * masks; the 10th frame uses `roll1Mask`/`roll2Mask`/`roll3Mask` for its three
 * bonus rolls.
 */
export interface Frame {
  id: Uuid;
  gameId: Uuid;
  frameNumber: number;
  roll1Mask?: number | null;
  roll2Mask?: number | null;
  roll3Mask?: number | null;
  ballId?: Uuid | null;
  flags?: number | null;
  pocket?: number | null;
  footBoard?: number | null;
  targetBoard?: number | null;
}

/**
 * Derived scoring and statistics for a game (C5).
 *
 * Computed on demand from the game's authoritative frame masks; the result
 * is never persisted. All values are scratch scores: the game's `handicap`,
 * when present, is stored on the `Game` and is not applied here.
 */
export interface GameScore {
  /**
   * True when every one of the ten frames is settled (a settled tenth
   * frame includes its earned bonus rolls).
   */
  isComplete: boolean;
  /**
   * Provisional total score: points earned so far, counting partial frames
   * (an in-flight strike counts 10, a partial open frame counts its
   * entered rolls). For a complete game this equals the final score.
   */
  totalScore: number;
  /**
   * Settled per-frame running totals (cumulative scores), one entry per
   * frame (ten entries). `null` marks frames that are not yet settled
   * (in-flight strike/spare, partial frame, or unstarted frame).
   */
  settledRunningTotals: Array<number | null>;
  /**
   * Settled per-frame scores (the frame's own points including earned
   * bonuses), one entry per frame (ten entries). `null` marks frames that
   * are not yet settled.
   */
  frameScores: Array<number | null>;
  /** Number of strike frames. */
  strikes: number;
  /** Number of spare frames. */
  spares: number;
  /** Number of open frames. */
  opens: number;
}

/* -------------------------------------------------------------------------- */
/* Operation inputs                                                            */
/* -------------------------------------------------------------------------- */

/** Input for creating a ball. */
export interface CreateBallInput {
  name: string;
  brand?: string | null;
  coverstock?: string | null;
}

/** Input for creating a house. */
export interface CreateHouseInput {
  name: string;
  location?: string | null;
}

/** Input for creating a pattern. */
export interface CreatePatternInput {
  name: string;
  length?: number | null;
}

/** Input for creating a league. */
export interface CreateLeagueInput {
  name: string;
  gamesPerSession?: number | null;
  houseId?: Uuid | null;
  houseName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

/** Input for updating a league. */
export interface UpdateLeagueInput {
  name: string;
  gamesPerSession?: number | null;
  houseId?: Uuid | null;
  houseName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

/** Input for creating a session (league or open). */
export interface CreateSessionInput {
  /** A league `Uuid` for a league session, or `null` for an open session. */
  leagueId: Uuid | null;
  /** ISO date string (`YYYY-MM-DD`). */
  date: string;
  weekNumber?: number | null;
  houseId?: Uuid | null;
  ballId?: Uuid | null;
  patternId?: Uuid | null;
  notes?: string | null;
  laneContext?: LaneContext | null;
}

/** Input for updating a session. */
export interface UpdateSessionInput {
  date: string;
  /** Reassign to a league, or set to `null` to make it an open session. */
  leagueId?: Uuid | null;
  weekNumber?: number | null;
  houseId?: Uuid | null;
  ballId?: Uuid | null;
  patternId?: Uuid | null;
  notes?: string | null;
  laneContext?: LaneContext | null;
}

/** Input for creating a game. */
export interface CreateGameInput {
  sessionId: Uuid;
  /** ISO date string (`YYYY-MM-DD`). */
  date: string;
  houseId?: Uuid | null;
  ballId?: Uuid | null;
  patternId?: Uuid | null;
  handicap?: number | null;
  notes?: string | null;
  laneContext?: LaneContext | null;
  ballSwitches?: BallSwitch[] | null;
}

/** Input for updating a game. */
export interface UpdateGameInput {
  date: string;
  houseId?: Uuid | null;
  ballId?: Uuid | null;
  patternId?: Uuid | null;
  handicap?: number | null;
  notes?: string | null;
  laneContext?: LaneContext | null;
  ballSwitches?: BallSwitch[] | null;
}

/**
 * A frame to write via `replaceGameFrames`. Keyed by `frameNumber`; the
 * service assigns the frame `Uuid`. Rolls use the canonical pin masks.
 */
export interface FrameInput {
  frameNumber: number;
  roll1Mask?: number | null;
  roll2Mask?: number | null;
  roll3Mask?: number | null;
  ballId?: Uuid | null;
  flags?: number | null;
  pocket?: number | null;
  footBoard?: number | null;
  targetBoard?: number | null;
}

/* -------------------------------------------------------------------------- */
/* List filters                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Filter for `listSessions`:
 *   - omitted / `undefined` → all sessions,
 *   - a `Uuid` → the sessions of that league,
 *   - `null`   → open (casual) sessions only.
 */
export interface ListSessionsFilter {
  leagueId?: Uuid | null;
}

/**
 * Filter for `listGames`:
 *   - `sessionId` → the games of that session,
 *   - `leagueId`  → the games across a league's sessions (canonical hierarchy).
 */
export interface ListGamesFilter {
  sessionId?: Uuid;
  leagueId?: Uuid;
}
