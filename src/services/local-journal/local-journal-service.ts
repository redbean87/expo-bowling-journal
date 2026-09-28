/**
 * The UI-facing local journal service contract (INTERFACE ONLY).
 *
 * This defines the surface of the local (SQLite-backed) journal service that
 * will replace the Convex-backed `convexJournalService`. No operation is
 * implemented here.
 *
 * The contract is domain-oriented (the seven canonical entities) and
 * independent of SQLite, Convex, authentication, and network state. All
 * operations are async (Promise-based) to match the current app's async
 * consumption and the async nature of the local SQLite layer.
 *
 * In scope: the canonical read/write operations the current app uses —
 * leagues, sessions, games, game frames, and the ball/house/pattern reference
 * data — including open sessions (`leagueId = null`).
 *
 * League summaries (`listLeagueSummaries`) return each league with the
 * derived `mostRecentSessionDate`; that value is computed by the service and
 * is never persisted in SQLite.
 *
 * Out of scope (deliberately not on this contract): scoring/statistics
 * analytics (game stats, session aggregates, spare conversion), import, and
 * export.
 */
import type {
  Ball,
  CreateBallInput,
  CreateGameInput,
  CreateHouseInput,
  CreateLeagueInput,
  CreatePatternInput,
  CreateSessionInput,
  Frame,
  FrameInput,
  Game,
  House,
  League,
  LeagueSummary,
  ListGamesFilter,
  ListSessionsFilter,
  Pattern,
  Session,
  Uuid,
  UpdateGameInput,
  UpdateLeagueInput,
  UpdateSessionInput,
} from './types';

export interface LocalJournalService {
  /* -- Leagues ---------------------------------------------------------- */
  listLeagues(): Promise<League[]>;
  /**
   * Leagues plus the derived `mostRecentSessionDate` (see `LeagueSummary`).
   * Lets the UI display league recency without fetching all sessions.
   */
  listLeagueSummaries(): Promise<LeagueSummary[]>;
  getLeague(id: Uuid): Promise<League | null>;
  createLeague(input: CreateLeagueInput): Promise<League>;
  updateLeague(id: Uuid, input: UpdateLeagueInput): Promise<League>;
  removeLeague(id: Uuid): Promise<void>;

  /* -- Sessions (league or open) --------------------------------------- */
  listSessions(filter?: ListSessionsFilter): Promise<Session[]>;
  getSession(id: Uuid): Promise<Session | null>;
  createSession(input: CreateSessionInput): Promise<Session>;
  updateSession(id: Uuid, input: UpdateSessionInput): Promise<Session>;
  removeSession(id: Uuid): Promise<void>;

  /* -- Games ------------------------------------------------------------ */
  listGames(filter?: ListGamesFilter): Promise<Game[]>;
  getGame(id: Uuid): Promise<Game | null>;
  createGame(input: CreateGameInput): Promise<Game>;
  updateGame(id: Uuid, input: UpdateGameInput): Promise<Game>;
  removeGame(id: Uuid): Promise<void>;

  /* -- Game frames ----------------------------------------------------- */
  getGameFrames(gameId: Uuid): Promise<Frame[]>;
  replaceGameFrames(gameId: Uuid, frames: FrameInput[]): Promise<void>;

  /* -- Reference data: balls ------------------------------------------- */
  listBalls(): Promise<Ball[]>;
  listRecentBalls(): Promise<Ball[]>;
  createBall(input: CreateBallInput): Promise<Ball>;

  /* -- Reference data: houses ------------------------------------------ */
  listHouses(): Promise<House[]>;
  listRecentHouses(): Promise<House[]>;
  createHouse(input: CreateHouseInput): Promise<House>;

  /* -- Reference data: patterns ---------------------------------------- */
  listPatterns(): Promise<Pattern[]>;
  listRecentPatterns(): Promise<Pattern[]>;
  createPattern(input: CreatePatternInput): Promise<Pattern>;
}
