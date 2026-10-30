/**
 * C-4 T5 — local import and restoration for both PinPal `.db` dialects.
 *
 * This is the import half of the local-first backup: it takes the bytes of a
 * PinPal `.db` file — the artifact `@/hooks/journal/use-export-sqlite-backup`
 * ships — and writes what it carries into the local journal through
 * `@/services/local-journal/local-journal-service`, with no server, no worker,
 * and no Convex round trip.
 *
 * ## The two dialects, and why they are read separately
 *
 * PinPal writes a different file on each device, and neither device reads the
 * other's file (`ROADMAP.md` and the captain's fixtures):
 *
 * - **Android** — a raw SQLite image at offset zero, `android_metadata`, and
 *   `_id INTEGER PRIMARY KEY` keys, carrying the wider column set
 *   (`sortOrder`, `lane`, `pocket`, `footBoard`, `targetBoard`).
 * - **iOS** — the PinPal Lite compound file: an app-state plist wrapper, then
 *   the SQLite image at byte offset 4096, keyed `pk INTEGER PRIMARY KEY`, with
 *   narrower tables that simply do not declare those columns.
 *
 * The container and the key layout are therefore checked against each other
 * rather than assumed: a raw image carrying `pk` keys, or a compound image
 * carrying `_id` keys, is a file neither device writes, and it is rejected
 * before anything is opened for reading. Column sets are read per dialect, so
 * the iOS file's missing columns come back as absent (`null`) rather than as
 * invented zeros.
 *
 * ## Where the work is shared
 *
 * The legacy row vocabulary is one language, so the readers hand back the
 * `@/services/local-journal/pinpal-backup-rows` row shapes the export half
 * already writes, and the mapping into the journal is dialect-independent. The
 * packed-pin decoding, the tenth frame's bonus slots, and the date convention
 * are the existing codecs — `@/convex/lib/import_canonical_frames` and
 * `@/convex/lib/import_dates` — reused rather than restated, so the import
 * half and the export half agree by construction.
 *
 * ## What restoration deliberately is not
 *
 * Restoration is additive: it creates entities and replaces the frames only of
 * the games it just created. It never deletes, clears, merges into, or edits
 * an entity the journal already holds, and it never persists the file's
 * integer keys — every imported entity gets a fresh local `Uuid`, and every
 * `…Fk` resolves through the ids this import created. A file that fails
 * validation (not a PinPal backup, truncated, hybrid, or a payload whose
 * references do not resolve) throws before the first journal write.
 */
import { type SQLiteDatabase, deserializeDatabaseAsync } from 'expo-sqlite';

import {
  type JournalBackupData,
  validateJournalBackupData,
} from './journal-backup-format';
import { type LocalJournalService } from './local-journal-service';
import {
  PINPAL_ABSENT_FOREIGN_KEY,
  PINPAL_OPEN_BOWLING_LEAGUE_KEY,
  PINPAL_PLACEHOLDER_FRAME_FLAGS,
  PINPAL_STRIKE_FRAME_FLAG,
  type LegacyBallRow,
  type LegacyFrameRow,
  type LegacyGameRow,
  type LegacyHouseRow,
  type LegacyLeagueRow,
  type LegacyPatternRow,
  type LegacyWeekRow,
  type PinPalLegacyRows,
} from './pinpal-backup-rows';
import {
  type Ball,
  type Frame,
  type FrameInput,
  type Game,
  type House,
  type League,
  type Pattern,
  type Session,
  type Uuid,
} from './types';
import { newLocalUuid } from './uuid-source';
import { normalizeImportDateStrict } from '../../../convex/lib/import_dates';
import {
  laneContextFromLane,
  normalizeOptionalText,
} from '../../../convex/lib/import_refinement';

/** The ten standing pins, the mask a knocked-down count rebuilds. */
const FULL_PIN_MASK = 0x3ff;

/** The 16 bytes every raw SQLite image starts with. */
const SQLITE_MAGIC = 'SQLite format 3\u0000';

/**
 * Where the SQLite image sits inside each dialect's container: raw on Android,
 * behind the compound file's app-state wrapper on iOS. The same offset
 * `@/hooks/journal/import-backup/file-validation` sniffs for the picker.
 */
const PINPAL_COMPOUND_SQLITE_OFFSET = 4096;

/** The dialect a container implies, and the key column each one's tables use. */
type PinpalBackupDialect = 'android' | 'ios';

const PINPAL_KEY_COLUMN: Record<PinpalBackupDialect, string> = {
  android: '_id',
  ios: 'pk',
};

/**
 * The columns each dialect's tables declare, measured from the captain's
 * fixtures and from the DDL the two dialect writers emit. Reading a column the
 * dialect does not declare would throw, so the list is the dialect's schema
 * difference made explicit rather than assumed.
 */
const PINPAL_TABLE_COLUMNS: Record<
  PinpalBackupDialect,
  Record<string, string[]>
> = {
  android: {
    house: ['_id', 'name', 'sortOrder', 'flags'],
    pattern: ['_id', 'name', 'sortOrder', 'flags'],
    ball: ['_id', 'name', 'sortOrder', 'flags'],
    league: [
      '_id',
      'ballFk',
      'patternFk',
      'houseFk',
      'name',
      'games',
      'notes',
      'sortOrder',
      'flags',
    ],
    week: [
      '_id',
      'leagueFk',
      'ballFk',
      'patternFk',
      'houseFk',
      'date',
      'notes',
      'lane',
    ],
    game: [
      '_id',
      'weekFk',
      'leagueFk',
      'ballFk',
      'patternFk',
      'houseFk',
      'score',
      'frame',
      'flags',
      'singlePinSpareScore',
      'notes',
      'lane',
    ],
    frame: [
      '_id',
      'gameFk',
      'weekFk',
      'leagueFk',
      'ballFk',
      'frameNum',
      'pins',
      'scores',
      'score',
      'flags',
      'pocket',
      'footBoard',
      'targetBoard',
    ],
  },
  ios: {
    house: ['pk', 'name', 'flags'],
    pattern: ['pk', 'name', 'flags'],
    ball: ['pk', 'name', 'flags'],
    league: [
      'pk',
      'ballFk',
      'patternFk',
      'houseFk',
      'name',
      'games',
      'notes',
      'flags',
    ],
    week: ['pk', 'leagueFk', 'ballFk', 'patternFk', 'houseFk', 'date', 'notes'],
    game: [
      'pk',
      'weekFk',
      'leagueFk',
      'ballFk',
      'patternFk',
      'houseFk',
      'score',
      'frame',
      'flags',
      'singlePinSpareScore',
      'notes',
    ],
    frame: [
      'pk',
      'gameFk',
      'weekFk',
      'leagueFk',
      'ballFk',
      'frameNum',
      'pins',
      'scores',
      'score',
      'flags',
    ],
  },
};

/** The legacy tables every PinPal backup must carry. */
const PINPAL_TABLE_NAMES = [
  'house',
  'pattern',
  'ball',
  'league',
  'week',
  'game',
  'frame',
];

/**
 * A file's SQLite image, and where it starts: offset zero for the raw Android
 * dialect, offset 4096 for the iOS compound dialect, `-1` for anything else.
 */
function sqliteMagicOffset(bytes: Uint8Array): number {
  for (const offset of [0, PINPAL_COMPOUND_SQLITE_OFFSET]) {
    if (offset + SQLITE_MAGIC.length > bytes.length) {
      continue;
    }

    let matches = true;

    for (let index = 0; index < SQLITE_MAGIC.length; index += 1) {
      if (bytes[offset + index] !== SQLITE_MAGIC.charCodeAt(index)) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return offset;
    }
  }

  return -1;
}

/** The image alone: the bytes from the magic on, so SQLite is handed a file. */
function sqliteImageBytes(bytes: Uint8Array, offset: number): Uint8Array {
  return offset === 0 ? bytes : bytes.slice(offset);
}

/** One column of a row, or `null` when the dialect does not declare it. */
function columnValue(row: Record<string, unknown>, column: string): unknown {
  return row[column];
}

/** A column read as an integer, or `null` when it is absent or `NULL`. */
function numberValue(
  row: Record<string, unknown>,
  column: string
): number | null {
  const value = columnValue(row, column);

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  return null;
}

/** A column read as trimmed text, or `null` when it is absent or blank. */
function textValue(
  row: Record<string, unknown>,
  column: string
): string | null {
  const value = columnValue(row, column);

  return normalizeOptionalText(typeof value === 'string' ? value : null);
}

/** A foreign key: `NULL` in the file means the same "no reference" as `0`. */
function foreignKeyValue(row: Record<string, unknown>, column: string): number {
  return numberValue(row, column) ?? PINPAL_ABSENT_FOREIGN_KEY;
}

/** The roll mask a ball that knocked down `count` pins carries. */
function maskFromRollCount(count: number | null): number | null {
  if (count === null) {
    return null;
  }

  if (count >= 10) {
    return FULL_PIN_MASK;
  }

  return count > 0 ? (1 << count) - 1 : 0;
}

/** Pins set in the second half of a packed `frame.pins` value. */
const SECOND_ROLL_SHIFT = 10;

/** Standing pins a packed `frame.pins` half carries, as a count. */
function standingPinCount(mask: number): number {
  let working = mask & FULL_PIN_MASK;
  let count = 0;

  while (working !== 0) {
    working &= working - 1;
    count += 1;
  }

  return count;
}

/**
 * The two balls of one legacy frame slot, read from its packed standing pins.
 *
 * This is the decoding `@/convex/lib/import_canonical_frames` has always
 * applied to a PinPal file: the legacy format records what still stands
 * rather than what fell, so each ball's count is the difference between the
 * racks. The flag is the fixtures' rule — a slot marked 193 is a strike — and
 * a slot whose first ball cleared the rack is one whatever the flag says.
 */
function decodeFrameSlot(row: LegacyFrameRow): DecodedFrameSlot {
  const packedPins =
    row.pins ?? FULL_PIN_MASK | (FULL_PIN_MASK << SECOND_ROLL_SHIFT);
  const standingAfterRoll1 = standingPinCount(packedPins & FULL_PIN_MASK);
  const standingAfterRoll2 = standingPinCount(
    (packedPins >> SECOND_ROLL_SHIFT) & FULL_PIN_MASK
  );
  const roll1 = Math.max(0, Math.min(10, 10 - standingAfterRoll1));
  const roll2 = Math.max(
    0,
    Math.min(standingAfterRoll1 - standingAfterRoll2, 10 - roll1)
  );

  return {
    roll1,
    roll2,
    isStrike: (row.flags ?? 0) === PINPAL_STRIKE_FRAME_FLAG || roll1 === 10,
  };
}

/**
 * The journal frames of one game, from its twelve legacy slots.
 *
 * Slots 0-8 are frames 1-9 and slots 9-11 are the tenth frame plus its bonus
 * balls, so the bonus balls fold back into the tenth frame's third ball —
 * the same reconstruction the server-side import path performs, in the same
 * slot order. A padded slot (flags 0) carries no ball and brings in nothing.
 */
function buildJournalFramesForGame(
  gameId: Uuid,
  sourceRows: LegacyFrameRow[],
  ballIdBySqlite: Map<number, Uuid>
): Frame[] {
  const populatedRows = sourceRows
    .filter((row) => (row.flags ?? 0) !== PINPAL_PLACEHOLDER_FRAME_FLAGS)
    .sort((left, right) => {
      if (left.frameNum !== right.frameNum) {
        return left.frameNum - right.frameNum;
      }

      return left.sqliteId - right.sqliteId;
    })
    .map((row) => ({ row, decoded: decodeFrameSlot(row) }));

  const output: Frame[] = [];

  const ballIdOf = (row: LegacyFrameRow): Uuid | null =>
    row.ballFk === PINPAL_ABSENT_FOREIGN_KEY
      ? null
      : (ballIdBySqlite.get(row.ballFk) ?? null);

  const appendFrame = (
    source: { row: LegacyFrameRow; decoded: DecodedFrameSlot } | undefined,
    frameNumber: number,
    roll1: number | null,
    roll2: number | null,
    roll3: number | null
  ): void => {
    if (source === undefined) {
      return;
    }

    output.push({
      id: newUuid(),
      gameId,
      frameNumber,
      roll1Mask: maskFromRollCount(roll1),
      roll2Mask: maskFromRollCount(roll2),
      roll3Mask: maskFromRollCount(roll3),
      ballId: ballIdOf(source.row),
      flags: source.row.flags,
      pocket: source.row.pocket,
      footBoard: source.row.footBoard,
      targetBoard: source.row.targetBoard,
    });
  };

  for (let slot = 0; slot < 9; slot += 1) {
    const entry = populatedRows[slot];

    if (entry === undefined) {
      break;
    }

    if (entry.decoded.isStrike) {
      appendFrame(entry, slot + 1, 10, null, null);
      continue;
    }

    appendFrame(
      entry,
      slot + 1,
      entry.decoded.roll1,
      entry.decoded.roll2,
      null
    );
  }

  const tenth = populatedRows[9];

  if (tenth === undefined) {
    return output;
  }

  const bonusRow1 = populatedRows[10];
  const bonusRow2 = populatedRows[11];

  if (tenth.decoded.isStrike) {
    const bonusRoll1 =
      bonusRow1 === undefined ? tenth.decoded.roll2 : bonusRow1.decoded.roll1;
    const bonusRoll2 =
      bonusRow2 === undefined
        ? bonusRow1 === undefined
          ? 0
          : bonusRow1.decoded.roll2
        : bonusRow2.decoded.roll1;

    appendFrame(tenth, 10, 10, bonusRoll1, bonusRoll2);

    return output;
  }

  const isSpare = tenth.decoded.roll1 + tenth.decoded.roll2 === 10;

  if (isSpare) {
    appendFrame(
      tenth,
      10,
      tenth.decoded.roll1,
      tenth.decoded.roll2,
      bonusRow1 === undefined ? 0 : bonusRow1.decoded.roll1
    );

    return output;
  }

  appendFrame(tenth, 10, tenth.decoded.roll1, tenth.decoded.roll2, null);

  return output;
}

interface DecodedFrameSlot {
  roll1: number;
  roll2: number;
  isStrike: boolean;
}

/**
 * The rows of one legacy table, in key order, as the converter's own row
 * shape — with the columns the dialect does not declare read back as `null`.
 */
async function readSqliteRows(
  db: SQLiteDatabase,
  table: string,
  columns: string[]
): Promise<Record<string, unknown>[]> {
  const keyColumn = columns[0];
  const selected = columns.join(', ');

  return (
    await db.getAllAsync<Record<string, unknown>>(
      `SELECT ${selected} FROM ${table} ORDER BY ${keyColumn} ASC`
    )
  ).map((row) => ({ ...row }));
}

/** One legacy `house`, `pattern` or `ball` row, keyed by its table's shape. */
function toLegacyReferenceRow(
  row: Record<string, unknown>,
  keyColumn: string
): LegacyHouseRow & LegacyPatternRow & LegacyBallRow {
  return {
    sqliteId: numberValue(row, keyColumn) ?? 0,
    name: textValue(row, 'name'),
    sortOrder: numberValue(row, 'sortOrder'),
    flags: numberValue(row, 'flags'),
  };
}

/** One legacy `league` row. */
function toLegacyLeagueRow(
  row: Record<string, unknown>,
  keyColumn: string
): LegacyLeagueRow {
  return {
    sqliteId: numberValue(row, keyColumn) ?? 0,
    ballFk: foreignKeyValue(row, 'ballFk'),
    patternFk: foreignKeyValue(row, 'patternFk'),
    houseFk: foreignKeyValue(row, 'houseFk'),
    name: textValue(row, 'name'),
    games: numberValue(row, 'games'),
    notes: textValue(row, 'notes'),
    sortOrder: numberValue(row, 'sortOrder'),
    flags: numberValue(row, 'flags'),
  };
}

/** One legacy `week` row. */
function toLegacyWeekRow(
  row: Record<string, unknown>,
  keyColumn: string
): LegacyWeekRow {
  return {
    sqliteId: numberValue(row, keyColumn) ?? 0,
    leagueFk: foreignKeyValue(row, 'leagueFk'),
    ballFk: foreignKeyValue(row, 'ballFk'),
    patternFk: foreignKeyValue(row, 'patternFk'),
    houseFk: foreignKeyValue(row, 'houseFk'),
    date: numberValue(row, 'date'),
    notes: textValue(row, 'notes'),
    lane: numberValue(row, 'lane'),
  };
}

/** One legacy `game` row. */
function toLegacyGameRow(
  row: Record<string, unknown>,
  keyColumn: string
): LegacyGameRow {
  return {
    sqliteId: numberValue(row, keyColumn) ?? 0,
    weekFk: foreignKeyValue(row, 'weekFk'),
    leagueFk: foreignKeyValue(row, 'leagueFk'),
    ballFk: foreignKeyValue(row, 'ballFk'),
    patternFk: foreignKeyValue(row, 'patternFk'),
    houseFk: foreignKeyValue(row, 'houseFk'),
    score: numberValue(row, 'score'),
    frame: numberValue(row, 'frame'),
    flags: numberValue(row, 'flags'),
    singlePinSpareScore: numberValue(row, 'singlePinSpareScore'),
    notes: textValue(row, 'notes'),
    lane: numberValue(row, 'lane'),
  };
}

/** One legacy `frame` row. */
function toLegacyFrameRow(
  row: Record<string, unknown>,
  keyColumn: string
): LegacyFrameRow {
  return {
    sqliteId: numberValue(row, keyColumn) ?? 0,
    gameFk: foreignKeyValue(row, 'gameFk'),
    weekFk: foreignKeyValue(row, 'weekFk'),
    leagueFk: foreignKeyValue(row, 'leagueFk'),
    ballFk: foreignKeyValue(row, 'ballFk'),
    frameNum: numberValue(row, 'frameNum') ?? 0,
    pins: numberValue(row, 'pins'),
    scores: numberValue(row, 'scores'),
    score: numberValue(row, 'score'),
    flags: numberValue(row, 'flags'),
    pocket: numberValue(row, 'pocket'),
    footBoard: numberValue(row, 'footBoard'),
    targetBoard: numberValue(row, 'targetBoard'),
  };
}

/**
 * The key column the file's own tables use, read from its schema rather than
 * taken from the container that held it: `_id` on Android, `pk` on iOS, `null`
 * when the file declares neither.
 *
 * The schema is introspected (`PRAGMA table_info`) rather than parsed as DDL
 * text: PinPal writes its `CREATE TABLE` statements with quoted identifiers —
 * the captain's fixtures declare `'_id' INTEGER PRIMARY KEY` and `'pk' INTEGER
 * PRIMARY KEY` — so a text check for `_id` immediately followed by `INTEGER`
 * misses every genuine PinPal file while our own unquoted export passes. The
 * column names and their primary-key flags come back the same however the
 * file was written, so quoting, casing, spacing and formatting cannot matter.
 */
async function readKeyColumn(db: SQLiteDatabase): Promise<string | null> {
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_schema WHERE type = 'table'"
  );

  for (const table of tables) {
    const quotedName = table.name.replace(/'/g, "''");
    const columns = await db.getAllAsync<{ name: string; pk: number }>(
      `SELECT * FROM pragma_table_info('${quotedName}')`
    );

    for (const column of columns) {
      if (column.pk < 1) {
        continue;
      }

      if (column.name === PINPAL_KEY_COLUMN.android) {
        return PINPAL_KEY_COLUMN.android;
      }

      if (column.name === PINPAL_KEY_COLUMN.ios) {
        return PINPAL_KEY_COLUMN.ios;
      }
    }
  }

  return null;
}

/**
 * Every legacy row of one file, read through the dialect's own column set.
 *
 * @throws when the file is missing one of the seven legacy tables, so a
 *         database that is not a PinPal backup never reaches the journal.
 */
async function readPinPalRows(
  db: SQLiteDatabase,
  dialect: PinpalBackupDialect
): Promise<PinPalLegacyRows> {
  const columns = PINPAL_TABLE_COLUMNS[dialect];
  const keyColumn = PINPAL_KEY_COLUMN[dialect];

  for (const table of PINPAL_TABLE_NAMES) {
    const declared = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?`,
      [table]
    );

    if (declared.length === 0) {
      throw new Error(
        `The selected file is not a PinPal backup: it is missing the legacy ${table} table.`
      );
    }
  }

  const houses: LegacyHouseRow[] = [];
  const patterns: LegacyPatternRow[] = [];
  const balls: LegacyBallRow[] = [];
  const leagues: LegacyLeagueRow[] = [];
  const weeks: LegacyWeekRow[] = [];
  const games: LegacyGameRow[] = [];
  const frames: LegacyFrameRow[] = [];

  for (const row of await readSqliteRows(db, 'house', columns.house)) {
    houses.push(toLegacyReferenceRow(row, keyColumn));
  }

  for (const row of await readSqliteRows(db, 'pattern', columns.pattern)) {
    patterns.push(toLegacyReferenceRow(row, keyColumn));
  }

  for (const row of await readSqliteRows(db, 'ball', columns.ball)) {
    balls.push(toLegacyReferenceRow(row, keyColumn));
  }

  for (const row of await readSqliteRows(db, 'league', columns.league)) {
    leagues.push(toLegacyLeagueRow(row, keyColumn));
  }

  for (const row of await readSqliteRows(db, 'week', columns.week)) {
    weeks.push(toLegacyWeekRow(row, keyColumn));
  }

  for (const row of await readSqliteRows(db, 'game', columns.game)) {
    games.push(toLegacyGameRow(row, keyColumn));
  }

  for (const row of await readSqliteRows(db, 'frame', columns.frame)) {
    frames.push(toLegacyFrameRow(row, keyColumn));
  }

  return { houses, patterns, balls, leagues, weeks, games, frames };
}

/**
 * Open a file's bytes as a PinPal backup and name its dialect.
 *
 * The container decides the dialect for reading, and the file's own key layout
 * has to agree with it — a file whose container and key layout disagree is a
 * hybrid neither device writes, and PinPal would refuse it too.
 *
 * @throws when the bytes hold no SQLite image, when the image cannot be
 *         opened (a truncated or corrupt file), or when the container and the
 *         key layout disagree.
 */
export async function readPinPalBackupImage(
  bytes: Uint8Array
): Promise<PinpalBackupImage> {
  const offset = sqliteMagicOffset(bytes);

  if (offset === -1) {
    throw new Error(
      'The selected file is not a PinPal backup: it holds no SQLite image at offset 0 (Android) or offset 4096 (iOS).'
    );
  }

  const container: PinpalBackupDialect = offset === 0 ? 'android' : 'ios';
  const db = await deserializeDatabaseAsync(sqliteImageBytes(bytes, offset));

  try {
    let keyColumn: string | null;

    try {
      keyColumn = await readKeyColumn(db);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      throw new Error(
        `The selected file's SQLite image could not be opened: ${reason}. It is truncated or corrupt, and PinPal would refuse it too.`
      );
    }

    if (keyColumn === null) {
      throw new Error(
        'The selected file is not a PinPal backup: its tables use neither the Android `_id` keys nor the iOS `pk` keys.'
      );
    }

    const dialect: PinpalBackupDialect =
      keyColumn === PINPAL_KEY_COLUMN.android ? 'android' : 'ios';

    if (dialect !== container) {
      throw new Error(
        `The selected file is a hybrid: a ${container === 'android' ? 'raw' : 'compound'} container holding the ${dialect} key layout. Neither device writes that file, and neither can import it.`
      );
    }

    return { dialect, rows: await readPinPalRows(db, dialect) };
  } finally {
    await db.closeAsync();
  }
}

/** How many rows of each legacy table could not be imported. */
export interface PinpalSkippedRows {
  houses: number;
  patterns: number;
  balls: number;
  leagues: number;
  weeks: number;
  games: number;
  frames: number;
}

/** The legacy rows one file carries, and the journal payload they map to. */
export interface PinpalConversionReport {
  data: JournalBackupData;
  skipped: PinpalSkippedRows;
}

/**
 * Map one file's legacy rows into the canonical journal payload — the same
 * `JournalBackupData` the export half reads on its way out, so the two halves
 * meet in the middle rather than at the file.
 *
 * The file's integer keys never reach the journal: every entity gets a fresh
 * `Uuid`, and every `…Fk` is resolved through the ids this import mints. `0`
 * means "no reference" and `-1` an open session's league, so an open-bowling
 * week comes back as a session with no league. A row whose reference does not
 * resolve, or whose date cannot be read, is skipped and counted rather than
 * invented — PinPal files carry rows the journal cannot place.
 *
 * `timezoneOffsetMinutes` is the caller's `new Date().getTimezoneOffset()`,
 * applied in reverse to the legacy local-midnight epoch (`ROADMAP.md:128`);
 * the iOS dialect's epoch seconds are recognized by the same date codec the
 * import path has always used.
 */
export function convertPinPalBackupRowsToJournalBackupData(
  rows: PinPalLegacyRows,
  timezoneOffsetMinutes: number
): PinpalConversionReport {
  const skipped = emptySkippedRows();
  const houses: House[] = [];
  const patterns: Pattern[] = [];
  const balls: Ball[] = [];
  const leagues: League[] = [];
  const sessions: Session[] = [];
  const games: Game[] = [];
  const frames: Frame[] = [];

  const houseIdBySqlite = new Map<number, Uuid>();
  const patternIdBySqlite = new Map<number, Uuid>();
  const ballIdBySqlite = new Map<number, Uuid>();
  const leagueIdBySqlite = new Map<number, Uuid>();
  const sessionIdBySqlite = new Map<number, Uuid>();
  const gameIdBySqlite = new Map<number, Uuid>();
  const sessionDateBySqlite = new Map<number, string>();

  for (const row of rows.houses) {
    if (row.name === null) {
      skipped.houses += 1;
      continue;
    }

    const id = newUuid();
    houseIdBySqlite.set(row.sqliteId, id);
    houses.push({ id, name: row.name, location: null });
  }

  for (const row of rows.patterns) {
    if (row.name === null) {
      skipped.patterns += 1;
      continue;
    }

    const id = newUuid();
    patternIdBySqlite.set(row.sqliteId, id);
    patterns.push({ id, name: row.name, length: null });
  }

  for (const row of rows.balls) {
    if (row.name === null) {
      skipped.balls += 1;
      continue;
    }

    const id = newUuid();
    ballIdBySqlite.set(row.sqliteId, id);
    balls.push({ id, name: row.name, brand: null, coverstock: null });
  }

  for (const row of rows.leagues) {
    if (row.name === null) {
      skipped.leagues += 1;
      continue;
    }

    const houseId = resolveReference(
      row.houseFk,
      houseIdBySqlite,
      /* openBowlingAllowed= */ false
    );

    if (houseId === undefined) {
      skipped.leagues += 1;
      continue;
    }

    const id = newUuid();
    leagueIdBySqlite.set(row.sqliteId, id);
    leagues.push({
      id,
      name: row.name,
      gamesPerSession: row.games,
      houseId,
      houseName: houseId === null ? null : houseNameOf(houses, houseId),
      startDate: null,
      endDate: null,
    });
  }

  for (const row of rows.weeks) {
    const date = normalizeImportDateStrict(row.date, timezoneOffsetMinutes);

    if (date === null) {
      skipped.weeks += 1;
      continue;
    }

    const leagueId = resolveReference(
      row.leagueFk,
      leagueIdBySqlite,
      /* openBowlingAllowed= */ true
    );

    if (leagueId === undefined) {
      skipped.weeks += 1;
      continue;
    }

    const houseId = resolveReference(
      row.houseFk,
      houseIdBySqlite,
      /* openBowlingAllowed= */ false
    );
    const ballId = resolveReference(
      row.ballFk,
      ballIdBySqlite,
      /* openBowlingAllowed= */ false
    );
    const patternId = resolveReference(
      row.patternFk,
      patternIdBySqlite,
      /* openBowlingAllowed= */ false
    );

    if (
      houseId === undefined ||
      ballId === undefined ||
      patternId === undefined
    ) {
      skipped.weeks += 1;
      continue;
    }

    const id = newUuid();
    sessionIdBySqlite.set(row.sqliteId, id);
    sessionDateBySqlite.set(row.sqliteId, date);
    sessions.push({
      id,
      leagueId,
      date,
      weekNumber: null,
      houseId,
      ballId,
      patternId,
      notes: row.notes,
      laneContext: laneContextFromLane(row.lane),
    });
  }

  for (const row of rows.games) {
    const sessionId = resolveReference(
      row.weekFk,
      sessionIdBySqlite,
      /* openBowlingAllowed= */ false
    );

    if (sessionId === undefined || sessionId === null) {
      skipped.games += 1;
      continue;
    }

    const date = sessionDateBySqlite.get(row.weekFk);

    if (date === undefined) {
      skipped.games += 1;
      continue;
    }

    const houseId = resolveReference(
      row.houseFk,
      houseIdBySqlite,
      /* openBowlingAllowed= */ false
    );
    const ballId = resolveReference(
      row.ballFk,
      ballIdBySqlite,
      /* openBowlingAllowed= */ false
    );
    const patternId = resolveReference(
      row.patternFk,
      patternIdBySqlite,
      /* openBowlingAllowed= */ false
    );

    if (
      houseId === undefined ||
      ballId === undefined ||
      patternId === undefined
    ) {
      skipped.games += 1;
      continue;
    }

    const id = newUuid();
    gameIdBySqlite.set(row.sqliteId, id);
    games.push({
      id,
      sessionId,
      date,
      houseId,
      ballId,
      patternId,
      handicap: null,
      notes: row.notes,
      laneContext: laneContextFromLane(row.lane),
      ballSwitches: null,
    });
  }

  const framesByGameFk = new Map<number, LegacyFrameRow[]>();

  for (const row of rows.frames) {
    const bucket = framesByGameFk.get(row.gameFk);

    if (bucket === undefined) {
      framesByGameFk.set(row.gameFk, [row]);
    } else {
      bucket.push(row);
    }
  }

  for (const row of rows.games) {
    const gameId = gameIdBySqlite.get(row.sqliteId);

    if (gameId === undefined) {
      continue;
    }

    frames.push(
      ...buildJournalFramesForGame(
        gameId,
        framesByGameFk.get(row.sqliteId) ?? [],
        ballIdBySqlite
      )
    );
  }

  // A played slot whose game did not come in is the only kind of frame row the
  // journal cannot place; the tenth frame's bonus slots are played rows that
  // fold into a frame this import did bring in, so they are not skipped.
  const importableGameKeys = new Set<number>(
    rows.games
      .filter((row) => gameIdBySqlite.has(row.sqliteId))
      .map((row) => row.sqliteId)
  );

  skipped.frames = rows.frames.filter(
    (frame) =>
      (frame.flags ?? 0) !== PINPAL_PLACEHOLDER_FRAME_FLAGS &&
      !importableGameKeys.has(frame.gameFk)
  ).length;

  return {
    data: { balls, houses, patterns, leagues, sessions, games, frames },
    skipped,
  };
}

/** A skipped-row counter with nothing skipped. */
function emptySkippedRows(): PinpalSkippedRows {
  return {
    houses: 0,
    patterns: 0,
    balls: 0,
    leagues: 0,
    weeks: 0,
    games: 0,
    frames: 0,
  };
}

/**
 * Resolve one legacy foreign key through the ids this import has minted.
 *
 * `null` means the file carried no reference (`0`, or `-1` where an open
 * session's league is legal); `undefined` means the reference named a row the
 * file does not carry, which the caller skips rather than guesses.
 */
function resolveReference(
  key: number,
  ids: Map<number, Uuid>,
  openBowlingAllowed: boolean
): Uuid | null | undefined {
  if (key === PINPAL_ABSENT_FOREIGN_KEY) {
    return null;
  }

  if (openBowlingAllowed && key === PINPAL_OPEN_BOWLING_LEAGUE_KEY) {
    return null;
  }

  return ids.get(key);
}

/** The house name this import just carried, for the league's display copy. */
function houseNameOf(houses: House[], houseId: Uuid | null): string | null {
  if (houseId === null) {
    return null;
  }

  return houses.find((house) => house.id === houseId)?.name ?? null;
}

/** A fresh local `Uuid`, the same source the journal service mints its keys from. */
function newUuid(): Uuid {
  return newLocalUuid();
}

/**
 * The journal's own ids for the payload's entities: the payload mints its ids
 * so it can be inspected before anything is written, and the service mints the
 * keys it actually stores, so every reference is re-pointed through this map.
 */
function createdIdOf(
  created: Map<Uuid, Uuid>,
  payloadId: Uuid | null | undefined
): Uuid | null {
  if (payloadId === null || payloadId === undefined) {
    return null;
  }

  const createdId = created.get(payloadId);

  if (createdId === undefined) {
    throw new Error(
      `restoreJournalBackupData: ${payloadId} was never created by this import`
    );
  }

  return createdId;
}

/** How many entities restoration wrote into the journal, per table. */
export interface PinpalRestoredCounts {
  houses: number;
  patterns: number;
  balls: number;
  leagues: number;
  sessions: number;
  games: number;
  frames: number;
}

/**
 * The journal's own id for one payload entity, for a reference the journal
 * requires — a session a game points at, which the payload's own validation
 * has already guaranteed exists.
 */
function createdRequiredIdOf(
  created: Map<Uuid, Uuid>,
  payloadId: Uuid | null | undefined
): Uuid {
  const createdId = createdIdOf(created, payloadId);

  if (createdId === null) {
    throw new Error(
      `restoreJournalBackupData: ${payloadId ?? 'missing'} was never created by this import`
    );
  }

  return createdId;
}

/**
 * Write one journal payload into the journal, and only ever add to it.
 *
 * The payload is validated before the first write, so a file whose references
 * do not resolve stops with nothing changed. Entities are created in
 * dependency order — reference data, leagues, sessions, games, then each game's
 * frames — so every reference names something the journal already holds.
 *
 * Nothing existing is touched: the journal's own entities are never edited,
 * removed, or merged into, and `replaceGameFrames` is called only on the games
 * this import just created, which have no frames to replace. Importing the
 * same file twice therefore brings in two copies, which is the established
 * import convention — the file is a snapshot, and the journal keeps both.
 *
 * @throws when the payload is not internally consistent
 *         (`validateJournalBackupData`) before any write happens.
 */
export async function restoreJournalBackupData(
  service: LocalJournalService,
  data: JournalBackupData
): Promise<PinpalRestoredCounts> {
  validateJournalBackupData(data);

  const created = new Map<Uuid, Uuid>();
  const counts: PinpalRestoredCounts = {
    houses: 0,
    patterns: 0,
    balls: 0,
    leagues: 0,
    sessions: 0,
    games: 0,
    frames: 0,
  };

  for (const house of data.houses) {
    const createdHouse = await service.createHouse({
      name: house.name,
      location: house.location,
    });
    created.set(house.id, createdHouse.id);
    counts.houses += 1;
  }

  for (const pattern of data.patterns) {
    const createdPattern = await service.createPattern({
      name: pattern.name,
      length: pattern.length,
    });
    created.set(pattern.id, createdPattern.id);
    counts.patterns += 1;
  }

  for (const ball of data.balls) {
    const createdBall = await service.createBall({
      name: ball.name,
      brand: ball.brand,
      coverstock: ball.coverstock,
    });
    created.set(ball.id, createdBall.id);
    counts.balls += 1;
  }

  for (const league of data.leagues) {
    const createdLeague = await service.createLeague({
      name: league.name,
      gamesPerSession: league.gamesPerSession,
      houseId: createdIdOf(created, league.houseId),
      houseName: league.houseName,
      startDate: league.startDate,
      endDate: league.endDate,
    });
    created.set(league.id, createdLeague.id);
    counts.leagues += 1;
  }

  for (const session of data.sessions) {
    const createdSession = await service.createSession({
      leagueId: createdIdOf(created, session.leagueId),
      date: session.date,
      weekNumber: session.weekNumber,
      houseId: createdIdOf(created, session.houseId),
      ballId: createdIdOf(created, session.ballId),
      patternId: createdIdOf(created, session.patternId),
      notes: session.notes,
      laneContext: session.laneContext,
    });
    created.set(session.id, createdSession.id);
    counts.sessions += 1;
  }

  const framesByGameId = new Map<Uuid, FrameInput[]>();

  for (const frame of data.frames) {
    const bucket = framesByGameId.get(frame.gameId);
    const input: FrameInput = {
      frameNumber: frame.frameNumber,
      roll1Mask: frame.roll1Mask,
      roll2Mask: frame.roll2Mask,
      roll3Mask: frame.roll3Mask,
      // The frame's ball is remapped like every other reference: the
      // payload's ids never reach the journal, and `frames.ballId` is a
      // foreign key into `balls`.
      ballId: createdIdOf(created, frame.ballId),
      flags: frame.flags,
      pocket: frame.pocket,
      footBoard: frame.footBoard,
      targetBoard: frame.targetBoard,
    };

    if (bucket === undefined) {
      framesByGameId.set(frame.gameId, [input]);
    } else {
      bucket.push(input);
    }
  }

  for (const game of data.games) {
    const sessionId = createdRequiredIdOf(created, game.sessionId);
    const createdGame = await service.createGame({
      sessionId,
      date: game.date,
      houseId: createdIdOf(created, game.houseId),
      ballId: createdIdOf(created, game.ballId),
      patternId: createdIdOf(created, game.patternId),
      handicap: game.handicap,
      notes: game.notes,
      laneContext: game.laneContext,
      ballSwitches: game.ballSwitches,
    });
    created.set(game.id, createdGame.id);
    counts.games += 1;

    const frames = framesByGameId.get(game.id) ?? [];

    if (frames.length === 0) {
      continue;
    }

    await service.replaceGameFrames(createdGame.id, frames);
    counts.frames += frames.length;
  }

  return counts;
}

/** What one file's import brought into the journal. */
export interface PinpalImportResult {
  dialect: PinpalBackupDialect;
  restored: PinpalRestoredCounts;
  skipped: PinpalSkippedRows;
}

/**
 * Import a PinPal `.db` file into the local journal, end to end.
 *
 * The bytes decide the dialect (never the file name or its extension), the
 * dialect's rows map into the canonical payload, and the payload is written
 * through the local journal service. Every step happens before the journal is
 * touched, so an unreadable file leaves the journal exactly as it was.
 *
 * @throws when the file is not a PinPal backup, cannot be opened, is a hybrid
 *         of the two dialects, or carries a payload the validator rejects.
 */
export async function importPinPalBackupIntoJournal(
  bytes: Uint8Array,
  service: LocalJournalService,
  timezoneOffsetMinutes: number
): Promise<PinpalImportResult> {
  const image = await readPinPalBackupImage(bytes);
  const report = convertPinPalBackupRowsToJournalBackupData(
    image.rows,
    timezoneOffsetMinutes
  );
  const restored = await restoreJournalBackupData(service, report.data);

  return {
    dialect: image.dialect,
    restored,
    skipped: report.skipped,
  };
}

/** A file's dialect, and the legacy rows it carries. */
export interface PinpalBackupImage {
  dialect: PinpalBackupDialect;
  rows: PinPalLegacyRows;
}
