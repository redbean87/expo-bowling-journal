/**
 * Local journal write adapter (app boundary).
 *
 * The write-side counterpart to `src/services/journal/local-reads.ts`: the
 * single place that maps the Convex-shaped mutation inputs and return values
 * the existing hooks and screens already speak (the input types in
 * `src/services/journal/types/mutations.ts`, whose ids are branded `Id<…>`)
 * onto the domain-oriented write operations of
 * {@link getLocalJournalService}, whose authoritative store is the local
 * SQLite database (docs/local-first-architecture.md §3: UI → local service →
 * SQLite).
 *
 * Every adapter performs a local write only: no server mutation, no offline
 * queue entry, no retry path, and no connectivity branching. In local mode
 * writes go straight to SQLite, and the legacy queue machinery stays cloud-
 * only.
 *
 * Identifier and shape translation (the signature/shape mismatch between the
 * mutation surface and the local service, resolved once here):
 * - Ids are local UUIDs. The service returns the entity, the mutations
 *   returned the entity id, so each adapter returns the persisted local UUID
 *   branded as the id type the callers already expect — the same cast
 *   pattern `local-reads.ts` uses on the read side. No synthetic or draft
 *   identifier is ever persisted or returned.
 * - `clientSyncId` and the league `type` field are transport artifacts
 *   (docs/local-first-architecture.md §2.7): they are not part of the
 *   canonical local model and are dropped here, never stored.
 * - `userId` is not written: the local journal has no concept of a user
 *   (see the `LOCAL_JOURNAL_USER_ID` sentinel documented in
 *   `local-reads.ts`).
 * - The documented open-session sentinel {@link LOCAL_JOURNAL_OPEN_LEAGUE_ID}
 *   maps back to `null` on the write side, so an open session never persists
 *   a dangling league foreign key.
 * - Frames arrive in the transport shape (`EditableFrameInput`: roll counts
 *   plus the optional manual pin pack) and leave as the canonical 10-bit
 *   pin masks (`FrameInput`), converted by the existing `toFrameDrafts`
 *   converter so the two representations cannot drift apart. Frames outside
 *   1–10 are ignored, matching that converter.
 *
 * Validation, foreign keys, transactions, and errors belong to the local
 * service and are preserved here: this module adds no validation of its own
 * and propagates every service error unchanged. The canonical foreign keys
 * are enforced with NO ACTION, so `removeLeague` and `removeSession` reject
 * while children still reference the parent — deleting a league or a session
 * is not extended into a cascade beyond the approved game scope. `removeGame`
 * is that approved scope (the game plus its frames): the game's frames are
 * cleared first, then the game is deleted, and neither its session nor its
 * league is touched. An unknown game id stays a no-op, matching the service.
 *
 * Return values mirror the mutations the hooks awaited: the entity id for
 * create/update/remove, and the game id for a frame replacement.
 * `createHouse` returns the plain local UUID: the journal type surface has
 * no branded house id, and the reference-data callers coerce the created id
 * to a string.
 */

import { LOCAL_JOURNAL_OPEN_LEAGUE_ID } from './local-reads';

import type {
  BallId,
  CreateBallInput,
  CreateGameInput,
  CreateHouseInput,
  CreateLeagueInput,
  CreatePatternInput,
  CreateSessionInput,
  EditableFrameInput,
  GameId,
  LeagueId,
  PatternId,
  RemoveGameInput,
  RemoveLeagueInput,
  RemoveSessionInput,
  ReplaceFramesInput,
  SessionId,
  UpdateGameInput,
  UpdateLeagueInput,
  UpdateSessionInput,
} from './types';
import type { FrameInput, Uuid } from '@/services/local-journal';

import { toFrameDrafts } from '@/screens/game-editor/frame-mask-utils';
import { getLocalJournalService } from '@/services/local-journal';

/**
 * Resolve a session's league foreign key in the local contract: the
 * documented open-session sentinel becomes `null` (an open session), every
 * other value is the local UUID it already is.
 */
function toLocalLeagueForeignKey(leagueId: LeagueId): Uuid | null {
  return leagueId === LOCAL_JOURNAL_OPEN_LEAGUE_ID ? null : (leagueId as Uuid);
}

/**
 * Convert the transport frame payload (`EditableFrameInput`) into the
 * canonical frame inputs the local service stores, keeping exactly the
 * frames the caller supplied. `toFrameDrafts` indexes by `frameNumber`, so
 * the drafts are read back through the same index and only the supplied
 * frame numbers are emitted.
 */
function toLocalFrameInputs(frames: EditableFrameInput[]): FrameInput[] {
  const drafts = toFrameDrafts(frames);
  const suppliedFrameNumbers = new Set(
    frames.map((frame) => frame.frameNumber)
  );

  return drafts
    .map((draft, index) => ({
      frameNumber: index + 1,
      roll1Mask: draft.roll1Mask,
      roll2Mask: draft.roll2Mask,
      roll3Mask: draft.roll3Mask,
    }))
    .filter((frame) => suppliedFrameNumbers.has(frame.frameNumber));
}

/**
 * Create a league locally and return its persisted id. `clientSyncId` and
 * `leagueType` are transport-only and are not stored.
 */
export async function createLeague(
  input: CreateLeagueInput
): Promise<LeagueId> {
  const service = getLocalJournalService();
  const league = await service.createLeague({
    name: input.name,
    gamesPerSession: input.gamesPerSession,
    houseId: input.houseId,
    houseName: input.houseName,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  return league.id as LeagueId;
}

/**
 * Update a league locally and return its persisted id. Omitted fields keep
 * the stored value and `null` clears it, per the local service.
 */
export async function updateLeague(
  input: UpdateLeagueInput
): Promise<LeagueId> {
  const service = getLocalJournalService();
  const league = await service.updateLeague(input.leagueId, {
    name: input.name,
    gamesPerSession: input.gamesPerSession,
    houseId: input.houseId,
  });

  return league.id as LeagueId;
}

/**
 * Delete a league locally. The canonical foreign keys are enforced with NO
 * ACTION, so a league that still has sessions rejects; nothing cascades.
 */
export async function removeLeague(
  input: RemoveLeagueInput
): Promise<LeagueId> {
  const service = getLocalJournalService();
  await service.removeLeague(input.leagueId);

  return input.leagueId;
}

/**
 * Create a session locally (a league session, or an open session when the
 * documented sentinel resolves to `null`) and return its persisted id.
 */
export async function createSession(
  input: CreateSessionInput
): Promise<SessionId> {
  const service = getLocalJournalService();
  const session = await service.createSession({
    leagueId: toLocalLeagueForeignKey(input.leagueId),
    date: input.date,
    weekNumber: input.weekNumber,
    houseId: input.houseId,
    ballId: input.ballId,
    patternId: input.patternId,
  });

  return session.id as SessionId;
}

/**
 * Update a session locally and return its persisted id.
 */
export async function updateSession(
  input: UpdateSessionInput
): Promise<SessionId> {
  const service = getLocalJournalService();
  const session = await service.updateSession(input.sessionId, {
    date: input.date,
    weekNumber: input.weekNumber,
    houseId: input.houseId,
    ballId: input.ballId,
    patternId: input.patternId,
  });

  return session.id as SessionId;
}

/**
 * Delete a session locally. The canonical foreign keys are enforced with NO
 * ACTION, so a session that still has games rejects; nothing cascades.
 */
export async function removeSession(
  input: RemoveSessionInput
): Promise<SessionId> {
  const service = getLocalJournalService();
  await service.removeSession(input.sessionId);

  return input.sessionId;
}

/**
 * Create a game locally and return its persisted id. `clientSyncId` is
 * transport-only and is not stored.
 */
export async function createGame(input: CreateGameInput): Promise<GameId> {
  const service = getLocalJournalService();
  const game = await service.createGame({
    sessionId: input.sessionId,
    date: input.date,
    ballId: input.ballId,
    patternId: input.patternId,
  });

  return game.id as GameId;
}

/**
 * Update a game locally and return its persisted id.
 */
export async function updateGame(input: UpdateGameInput): Promise<GameId> {
  const service = getLocalJournalService();
  const game = await service.updateGame(input.gameId, {
    date: input.date,
    ballId: input.ballId,
    patternId: input.patternId,
  });

  return game.id as GameId;
}

/**
 * Delete a game locally — the approved game scope: the game and its frames,
 * never its session or its league. The frames are cleared first because the
 * canonical foreign keys are enforced with NO ACTION, so a game that still
 * has referencing frames cannot be deleted. An unknown id is a no-op,
 * matching the local service.
 */
export async function removeGame(input: RemoveGameInput): Promise<GameId> {
  const service = getLocalJournalService();
  const gameId = input.gameId;

  if ((await service.getGame(gameId)) === null) {
    return gameId;
  }

  await service.replaceGameFrames(gameId, []);
  await service.removeGame(gameId);

  return gameId;
}

/**
 * Replace a game's frames locally in the service's all-or-nothing
 * transaction, and return the game id the mutation surface returns.
 */
export async function replaceFramesForGame(
  input: ReplaceFramesInput
): Promise<GameId> {
  const service = getLocalJournalService();
  await service.replaceGameFrames(
    input.gameId,
    toLocalFrameInputs(input.frames)
  );

  return input.gameId;
}

/**
 * Create a ball locally and return its persisted id.
 */
export async function createBall(input: CreateBallInput): Promise<BallId> {
  const service = getLocalJournalService();
  const ball = await service.createBall({ name: input.name });

  return ball.id as BallId;
}

/**
 * Create a house locally and return its persisted local UUID.
 */
export async function createHouse(input: CreateHouseInput): Promise<Uuid> {
  const service = getLocalJournalService();
  const house = await service.createHouse({ name: input.name });

  return house.id;
}

/**
 * Create an oil pattern locally and return its persisted id.
 */
export async function createPattern(
  input: CreatePatternInput
): Promise<PatternId> {
  const service = getLocalJournalService();
  const pattern = await service.createPattern({ name: input.name });

  return pattern.id as PatternId;
}
