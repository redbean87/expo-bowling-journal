/**
 * Local journal read adapter (app boundary).
 *
 * Maps the canonical local (SQLite) journal domain (C1,
 * `src/services/local-journal`) to the Convex document shapes consumed by
 * the existing read hooks and screens (`League`, `Session`, `GameListItem`),
 * so unauthenticated users can read locally persisted data without a Convex
 * session. This module is the only place that knows both the local domain
 * and the Convex document types; the local service itself stays
 * Convex-free.
 *
 * Local entities carry no Convex metadata, so the following documented
 * sentinels are centralized here:
 * - `userId` is always {@link LOCAL_JOURNAL_USER_ID}: the local journal has
 *   no concept of a user. The value is a fixed null-UUID cast to
 *   `Id<'users'>`; it identifies "locally persisted" and never refers to a
 *   real Convex user row.
 * - `_creationTime` for sessions and games is derived from the entity's
 *   stored `date` (UTC midnight epoch ms); the local journal stores no
 *   creation timestamps. Leagues have no stored date, so league
 *   `_creationTime` and `League.createdAt` are the `0` sentinel (no consumer
 *   re-orders leagues by these values; the adapter sorts leagues itself).
 * - `leagueId` for a game whose session is an open session
 *   (`sessions.leagueId = null`, a local-only concept) is
 *   {@link LOCAL_JOURNAL_OPEN_LEAGUE_ID}; no game read/display path reads
 *   `game.leagueId`, the value only satisfies the document type.
 * - `clientSyncId` and `framePreview` are omitted: local entities have no
 *   sync identity and frame previews are not derivable from local data.
 *   Both fields are optional in the document types and every consumer
 *   guards for their absence.
 *
 * Ordering mimics the Convex list queries the hooks otherwise read:
 * leagues by `mostRecentSessionDate` descending (nulls last; ties keep the
 * local service order because the local journal stores no league creation
 * time), and sessions/games by `date` descending (id ascending on ties).
 */

import type {
  BallId,
  GameId,
  GameListItem,
  League,
  LeagueId,
  PatternId,
  Session,
  SessionId,
} from './types';
import type { Id } from '../../../convex/_generated/dataModel';
import type {
  BallSwitch,
  Game as LocalGame,
  GameScore,
  League as LocalLeague,
  LeagueSummary,
  Session as LocalSession,
  Uuid,
} from '@/services/local-journal';

import { getLocalJournalService } from '@/services/local-journal';

/**
 * Documented sentinel `userId` for every local journal document (see module
 * docs). Fixed null-UUID, branded as `Id<'users'>`.
 */
export const LOCAL_JOURNAL_USER_ID: Id<'users'> =
  '00000000-0000-0000-0000-000000000000' as Id<'users'>;

/**
 * Documented sentinel `leagueId` for games of open (non-league) sessions
 * (see module docs). Fixed null-UUID, branded as `Id<'leagues'>`.
 */
export const LOCAL_JOURNAL_OPEN_LEAGUE_ID: LeagueId =
  '00000000-0000-0000-0000-000000000000' as LeagueId;

/**
 * Lean projection of a local league summary in the exact shape the home
 * league hook's `DisplayLeague` expects (`_id` is the plain local UUID
 * string).
 */
export interface LocalLeagueSummaryView {
  _id: string;
  name: string;
  houseName: string | null;
  gamesPerSession: number | null;
  mostRecentSessionDate: string | null;
}

/**
 * Order league summaries the way the Convex `leagues.list` query does:
 * `mostRecentSessionDate` descending with nulls last. Ties return 0 so the
 * stable sort keeps the local service order (the local journal stores no
 * league creation time to substitute for the query's `createdAt` tie-break).
 */
function compareLocalLeagueRecency(a: LeagueSummary, b: LeagueSummary): number {
  if (a.mostRecentSessionDate === null && b.mostRecentSessionDate === null) {
    return 0;
  }
  if (a.mostRecentSessionDate === null) {
    return 1;
  }
  if (b.mostRecentSessionDate === null) {
    return -1;
  }
  return b.mostRecentSessionDate.localeCompare(a.mostRecentSessionDate);
}

/**
 * Order sessions/games the way the Convex `sessions.listByLeague` and
 * `games.listBySession` queries do: `date` descending, then the local
 * service's canonical id order (the local journal stores no creation time
 * to substitute for the queries' `_creationTime` tie-break).
 */
function compareLocalDateDescendingThenId(
  a: { date: string; id: Uuid },
  b: { date: string; id: Uuid }
): number {
  if (a.date !== b.date) {
    return b.date.localeCompare(a.date);
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Derived `_creationTime` for local sessions/games: UTC midnight epoch ms of
 * the entity's stored ISO date. The local journal stores no creation
 * timestamps; the stored date is the closest real recency signal and drives
 * the games screen display order and "start latest game" selection.
 */
function toLocalCreationTime(date: string): number {
  const creationTime = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(creationTime) ? creationTime : 0;
}

/**
 * Map a local league to the Convex `leagues` document shape. Optional
 * schema fields without a local counterpart (`clientSyncId`, `type`,
 * `isOpenBowling`, `legacyFlags`) are omitted; every consumer resolves them
 * with safe defaults.
 */
function toLocalLeagueDocument(league: LocalLeague): League {
  const doc: League = {
    _id: league.id as LeagueId,
    _creationTime: 0,
    userId: LOCAL_JOURNAL_USER_ID,
    name: league.name,
    createdAt: 0,
  };
  if (league.gamesPerSession !== undefined) {
    doc.gamesPerSession = league.gamesPerSession;
  }
  if (league.houseId !== undefined) {
    doc.houseId =
      league.houseId === null ? null : (league.houseId as Id<'houses'>);
  }
  if (league.houseName !== undefined) {
    doc.houseName = league.houseName;
  }
  if (league.startDate !== undefined) {
    doc.startDate = league.startDate;
  }
  if (league.endDate !== undefined) {
    doc.endDate = league.endDate;
  }
  return doc;
}

/**
 * Map a local session to the Convex `sessions` document shape.
 */
function toLocalSessionDocument(session: LocalSession): Session {
  return {
    _id: session.id as SessionId,
    _creationTime: toLocalCreationTime(session.date),
    userId: LOCAL_JOURNAL_USER_ID,
    leagueId:
      session.leagueId === null
        ? LOCAL_JOURNAL_OPEN_LEAGUE_ID
        : (session.leagueId as LeagueId),
    date: session.date,
    weekNumber: session.weekNumber,
    houseId:
      session.houseId === undefined
        ? null
        : session.houseId === null
          ? null
          : (session.houseId as Id<'houses'>),
    ballId:
      session.ballId === undefined
        ? null
        : session.ballId === null
          ? null
          : (session.ballId as BallId),
    patternId:
      session.patternId === undefined
        ? null
        : session.patternId === null
          ? null
          : (session.patternId as PatternId),
    notes: session.notes,
    laneContext: session.laneContext,
  };
}

/**
 * Map local ball switches to the Convex `games.ballSwitches` shape (the
 * only difference is the branded `ballId`).
 */
function toLocalBallSwitches(
  ballSwitches: BallSwitch[]
): NonNullable<GameListItem['ballSwitches']> {
  return ballSwitches.map((ballSwitch) => {
    const item: {
      frameNumber: number;
      rollNumber?: number | null;
      ballId?: BallId | null;
      ballName?: string | null;
      note?: string | null;
    } = { frameNumber: ballSwitch.frameNumber };
    if (ballSwitch.rollNumber !== undefined) {
      item.rollNumber = ballSwitch.rollNumber;
    }
    if (ballSwitch.ballId !== undefined) {
      item.ballId =
        ballSwitch.ballId === null ? null : (ballSwitch.ballId as BallId);
    }
    if (ballSwitch.ballName !== undefined) {
      item.ballName = ballSwitch.ballName;
    }
    if (ballSwitch.note !== undefined) {
      item.note = ballSwitch.note;
    }
    return item;
  });
}

/**
 * Map a local game (plus its derived C5 score and session league id) to the
 * Convex `games` document shape. `totalScore`, `strikes`, `spares`, and
 * `opens` come from the derived score — the local journal stores frames,
 * not aggregates — with a defensive zero fallback. `framePreview` and
 * `clientSyncId` are omitted (see module docs).
 */
function toLocalGameDocument(
  game: LocalGame,
  score: GameScore | null,
  sessionLeagueId: Uuid | null
): GameListItem {
  return {
    _id: game.id as GameId,
    _creationTime: toLocalCreationTime(game.date),
    userId: LOCAL_JOURNAL_USER_ID,
    sessionId: game.sessionId as SessionId,
    leagueId:
      sessionLeagueId === null
        ? LOCAL_JOURNAL_OPEN_LEAGUE_ID
        : (sessionLeagueId as LeagueId),
    date: game.date,
    totalScore: score?.totalScore ?? 0,
    strikes: score?.strikes ?? 0,
    spares: score?.spares ?? 0,
    opens: score?.opens ?? 0,
    ballId:
      game.ballId === undefined
        ? null
        : game.ballId === null
          ? null
          : (game.ballId as BallId),
    patternId:
      game.patternId === undefined
        ? null
        : game.patternId === null
          ? null
          : (game.patternId as PatternId),
    handicap: game.handicap,
    notes: game.notes,
    laneContext: game.laneContext,
    ballSwitches:
      game.ballSwitches === undefined || game.ballSwitches === null
        ? null
        : toLocalBallSwitches(game.ballSwitches),
  };
}

/**
 * List local leagues in the Convex `leagues` document shape, ordered like
 * the Convex `leagues.list` query (`mostRecentSessionDate` descending, nulls
 * last).
 */
export async function listLocalLeagues(): Promise<League[]> {
  const service = getLocalJournalService();
  const summaries = await service.listLeagueSummaries();
  return [...summaries]
    .sort(compareLocalLeagueRecency)
    .map(toLocalLeagueDocument);
}

/**
 * List the sessions of one league in the Convex `sessions` document shape,
 * ordered like the Convex `sessions.listByLeague` query (`date` descending).
 */
export async function listLocalSessionsByLeague(
  leagueId: Uuid
): Promise<Session[]> {
  const service = getLocalJournalService();
  const sessions = await service.listSessions({ leagueId });
  return [...sessions]
    .sort(compareLocalDateDescendingThenId)
    .map(toLocalSessionDocument);
}

/**
 * List the games of one session in the Convex `games` document shape,
 * ordered like the Convex `games.listBySession` query (`date` descending).
 * Score aggregates are derived via the local C5 `getGameScore`; the game's
 * `leagueId` comes from its session (open sessions use the documented
 * sentinel — see module docs).
 */
export async function listLocalGamesBySession(
  sessionId: Uuid
): Promise<GameListItem[]> {
  const service = getLocalJournalService();
  const [session, games] = await Promise.all([
    service.getSession(sessionId),
    service.listGames({ sessionId }),
  ]);
  const sessionLeagueId = session?.leagueId ?? null;
  const sortedGames = [...games].sort(compareLocalDateDescendingThenId);
  return Promise.all(
    sortedGames.map(async (game) => {
      const score = await service.getGameScore(game.id);
      return toLocalGameDocument(game, score, sessionLeagueId);
    })
  );
}

/**
 * List local league summaries in the home-league view shape (see
 * {@link LocalLeagueSummaryView}), ordered like the Convex `leagues.list`
 * query.
 */
export async function listLocalLeagueSummaries(): Promise<
  LocalLeagueSummaryView[]
> {
  const service = getLocalJournalService();
  const summaries = await service.listLeagueSummaries();
  return [...summaries].sort(compareLocalLeagueRecency).map((summary) => ({
    _id: summary.id,
    name: summary.name,
    houseName: summary.houseName ?? null,
    gamesPerSession: summary.gamesPerSession ?? null,
    mostRecentSessionDate: summary.mostRecentSessionDate,
  }));
}
