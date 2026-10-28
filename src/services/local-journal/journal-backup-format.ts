/**
 * C-4 G1/G2 — the version-1 local backup (export) contract and its canonical
 * serializer.
 *
 * This module is the export half of the §4 adapter pipeline
 * (`docs/local-first-architecture.md:261-311`):
 *
 * ```text
 * SQLite -> canonical model -> export adapter -> portable file
 * ```
 *
 * It reads the canonical domain entities THROUGH the local journal service
 * (`LocalJournalService`), so the payload mirrors the canonical model rather
 * than the SQLite column layout or the PinPal database schema (Packet G1:
 * "The exact field layout must mirror the canonical model"). It has no Convex,
 * authentication, network, worker, or file-system dependency: the bytes are
 * produced here, and where they are written is a separate slice (Packet G3).
 *
 * ## The version-1 contract
 *
 * The portable file is a versioned, self-describing JSON document saved with
 * the `.json` extension (`JOURNAL_BACKUP_FILE_EXTENSION`). The `.pinpal`
 * extension stays reserved for the actual PinPal application's legacy import
 * format; it is a separate compatibility path and is never produced here.
 *
 * ```json
 * {
 *   "format": "bowling-journal",
 *   "version": 1,
 *   "exportedAt": "2026-10-28T13:58:00.000Z",
 *   "data": {
 *     "balls": [], "houses": [], "patterns": [],
 *     "leagues": [], "sessions": [], "games": [], "frames": []
 *   }
 * }
 * ```
 *
 * - `format` is the app's own tag (`bowling-journal`, matching the existing
 *   `bowling-journal-YYYY-MM-DD` backup filename stem), deliberately NOT
 *   `pinpal`: the tag identifies OUR canonical document, and a reader uses it
 *   to pick the right parser before parsing anything else.
 * - `version` is the integer schema version of the payload layout.
 * - `exportedAt` is an ISO-8601 UTC timestamp for the moment of export.
 * - `data` always carries all seven canonical tables, even when empty.
 *
 * ## Payload boundary (what round-trips, and what deliberately does not)
 *
 * Round-tripped: the seven canonical tables (`balls`, `houses`, `patterns`,
 * `leagues`, `sessions`, `games`, `frames`) with their UUID text keys, their
 * nullable/NOT-NULL relationships, the authoritative per-frame roll masks
 * (`roll1Mask`/`roll2Mask`/`roll3Mask`), the denormalized `League.houseName`
 * (persisted in the league `metadata` column and restored into it on import),
 * and the structured `laneContext` / `ballSwitches` values.
 *
 * Deliberately excluded (§2.6 "No silent data loss" plus §2.7 "Implementation
 * artifacts are not canonical data"):
 * - Derived values that are never persisted: `LeagueSummary.mostRecentSessionDate`
 *   and `GameScore` (recomputed on demand from the frame masks).
 * - The storage-only `metadata` columns on balls, houses, patterns, sessions,
 *   games, and frames: the canonical schema declares them, but the C1 domain
 *   has no field for them, so nothing writes them and nothing carries them.
 * - Journal-adjacent state that lives outside SQLite: the home-league pointer
 *   (`HOME_LEAGUE_STORAGE_KEY`, AsyncStorage), SecureStore preferences, and the
 *   offline queue / draft / client-sync stores. A backup is a journal backup,
 *   not an application-settings backup.
 * - Cloud state: Convex documents/IDs, authentication, and the worker pipeline.
 *
 * ## Snapshot consistency (stated, not assumed)
 *
 * The tables are read one query per table, in a fixed order, without wrapping
 * the reads in a transaction. `expo-sqlite`'s own `withTransactionAsync` is
 * documented as "not exclusive and can be interrupted by other async queries"
 * (`node_modules/expo-sqlite/build/SQLiteDatabase.d.ts:92`), so a transaction
 * would not buy the guarantee and could abort a concurrent app write instead.
 * The guarantee this serializer gives, and only this one:
 * - every table is internally consistent (one query returns a whole table);
 * - rows written by the journal service are single-row inserts/updates, so an
 *   interleaved write appears wholly before or wholly after the read of the
 *   table it touches;
 * - a multi-row frame replacement (`replaceGameFrames`, which IS transactional)
 *   can interleave between the `games` read and the per-game frame reads, so a
 *   frame set may reflect the pre- or post-replacement state per game.
 * No cross-table snapshot is claimed. A reader must therefore validate
 * relationships (this module does, before emitting) rather than assume the
 * document came from a frozen database.
 */
import type { LocalJournalService } from './local-journal-service';
import type {
  Ball,
  Frame,
  Game,
  House,
  League,
  Pattern,
  Session,
} from './types';

/** The `format` tag of this app's own backup document. */
export type JournalBackupFormat = 'bowling-journal';

/** The payload layout this module emits. */
export type JournalBackupVersion = 1;

/** The tag value, exported so readers and writers share one literal. */
export const JOURNAL_BACKUP_FORMAT: JournalBackupFormat = 'bowling-journal';

/** The version value, exported so readers and writers share one literal. */
export const JOURNAL_BACKUP_VERSION: JournalBackupVersion = 1;

/**
 * The extension of the file this contract describes.
 *
 * `.json` — never `.pinpal`, which stays the real PinPal app's import-only
 * format, and never `.db`, which was the worker-produced legacy image.
 */
export const JOURNAL_BACKUP_FILE_EXTENSION = '.json';

/** The seven canonical tables, in the fixed order the document emits them. */
export interface JournalBackupData {
  balls: Ball[];
  houses: House[];
  patterns: Pattern[];
  leagues: League[];
  sessions: Session[];
  games: Game[];
  frames: Frame[];
}

/** The version-1 envelope: self-describing, then the canonical payload. */
export interface JournalBackupDocument {
  format: JournalBackupFormat;
  version: JournalBackupVersion;
  exportedAt: string;
  data: JournalBackupData;
}

/**
 * Read the canonical model for a backup from the local journal service.
 *
 * Reads one query per table, in the fixed order leagues, sessions, games,
 * balls, houses, patterns, then each game's frames (in `listGames` order, so
 * the frame list is deterministic). Foreign keys are enforced on the shared
 * handle (`database.ts` sets `PRAGMA foreign_keys = ON`), so every frame
 * belongs to a listed game and every game to a listed session: reading the
 * frames of every listed game covers the whole `frames` table.
 *
 * @throws if the resulting payload fails {@link validateJournalBackupData}.
 */
export async function readJournalBackupData(
  service: LocalJournalService
): Promise<JournalBackupData> {
  const leagues = await service.listLeagues();
  const sessions = await service.listSessions();
  const games = await service.listGames();
  const balls = await service.listBalls();
  const houses = await service.listHouses();
  const patterns = await service.listPatterns();

  const frames: Frame[] = [];
  for (const game of games) {
    const gameFrames = await service.getGameFrames(game.id);
    for (const frame of gameFrames) {
      frames.push(frame);
    }
  }

  const data: JournalBackupData = {
    balls,
    houses,
    patterns,
    leagues,
    sessions,
    games,
    frames,
  };
  validateJournalBackupData(data);

  return data;
}

/**
 * Wrap canonical payload rows in the version-1 envelope.
 *
 * `exportedAt` must be a parseable ISO-8601 timestamp; the envelope records it
 * verbatim so a reader sees the export moment without re-parsing the payload.
 *
 * @throws on an unparseable `exportedAt`.
 */
export function createJournalBackupDocument(
  data: JournalBackupData,
  exportedAt: string
): JournalBackupDocument {
  if (exportedAt.length === 0 || !Number.isFinite(Date.parse(exportedAt))) {
    throw new Error(
      `exportedAt must be a parseable ISO-8601 timestamp (got "${exportedAt}")`
    );
  }

  return {
    format: JOURNAL_BACKUP_FORMAT,
    version: JOURNAL_BACKUP_VERSION,
    exportedAt,
    data,
  };
}

/**
 * Read the local journal and produce a version-1 backup document.
 *
 * The export half of the §4 pipeline: SQLite -> canonical model -> envelope.
 * No file is written and no database is replaced here (Packet G3 owns the
 * destination, and the restore target is a separate decision).
 */
export async function buildJournalBackupDocument(
  service: LocalJournalService,
  exportedAt: string
): Promise<JournalBackupDocument> {
  return createJournalBackupDocument(
    await readJournalBackupData(service),
    exportedAt
  );
}

/**
 * The JSON text of a backup document.
 *
 * Key order is the declaration order of the envelope and payload interfaces,
 * which is stable, so two exports of the same journal are text-diffable.
 */
export function serializeJournalBackupJson(
  document: JournalBackupDocument
): string {
  return JSON.stringify(document);
}

/**
 * Validate the payload before it is emitted (§2.6 "No silent data loss").
 *
 * Checks the identity and relationship invariants the contract promises:
 * every entity carries a non-empty id, ids are unique across the document, and
 * every relationship resolves to an entity that is present in the payload
 * (`null` is the only permitted dangling reference, and only where the
 * canonical schema allows it).
 *
 * @throws naming the first violated invariant.
 */
export function validateJournalBackupData(data: JournalBackupData): void {
  const seen = new Set<string>();
  const tables: Array<[string, unknown[]]> = [
    ['balls', data.balls],
    ['houses', data.houses],
    ['patterns', data.patterns],
    ['leagues', data.leagues],
    ['sessions', data.sessions],
    ['games', data.games],
    ['frames', data.frames],
  ];

  for (const [tableName, rows] of tables) {
    for (const row of rows) {
      const id = (row as { id?: unknown }).id;
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error(`${tableName}: an entity has no id`);
      }
      if (seen.has(id)) {
        throw new Error(`${tableName}: duplicate id ${id}`);
      }
      seen.add(id);
    }
  }

  const requirePresent = (
    source: string,
    target: string,
    id: string | null | undefined,
    present: Set<string>
  ): void => {
    if (id === null || id === undefined) {
      return;
    }
    if (!present.has(id)) {
      throw new Error(
        `${source} references ${target} ${id}, which is not in the payload`
      );
    }
  };

  const leagueIds = new Set(data.leagues.map((league) => league.id));
  const sessionIds = new Set(data.sessions.map((session) => session.id));
  const gameIds = new Set(data.games.map((game) => game.id));
  const ballIds = new Set(data.balls.map((ball) => ball.id));
  const houseIds = new Set(data.houses.map((house) => house.id));
  const patternIds = new Set(data.patterns.map((pattern) => pattern.id));

  for (const league of data.leagues) {
    requirePresent(`League ${league.id}`, 'house', league.houseId, houseIds);
  }
  for (const session of data.sessions) {
    requirePresent(
      `Session ${session.id}`,
      'league',
      session.leagueId,
      leagueIds
    );
    requirePresent(`Session ${session.id}`, 'house', session.houseId, houseIds);
    requirePresent(`Session ${session.id}`, 'ball', session.ballId, ballIds);
    requirePresent(
      `Session ${session.id}`,
      'pattern',
      session.patternId,
      patternIds
    );
  }
  for (const game of data.games) {
    requirePresent(`Game ${game.id}`, 'session', game.sessionId, sessionIds);
    requirePresent(`Game ${game.id}`, 'house', game.houseId, houseIds);
    requirePresent(`Game ${game.id}`, 'ball', game.ballId, ballIds);
    requirePresent(`Game ${game.id}`, 'pattern', game.patternId, patternIds);
  }
  for (const frame of data.frames) {
    requirePresent(`Frame ${frame.id}`, 'game', frame.gameId, gameIds);
    requirePresent(`Frame ${frame.id}`, 'ball', frame.ballId, ballIds);
  }
}
