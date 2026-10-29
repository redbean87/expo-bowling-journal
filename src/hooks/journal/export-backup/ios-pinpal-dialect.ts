/**
 * C-4 T3 (PinPal `.db` export) — the iOS PinPal dialect writer (app-side).
 *
 * `@/services/local-journal/pinpal-backup-rows` turns the local journal into
 * the seven legacy PinPal entity tables; this module is the iOS half of the
 * container that wraps those rows. It lays them into a fresh, isolated SQLite
 * database and returns the compound file PinPal imports on an iOS device: the
 * `pinpal-lite-compound` shape `src/hooks/journal/import-backup/file-
 * validation.ts` already sniffs — a 4096-byte app-state plist wrapper, then
 * the SQLite image at byte offset 4096 — carrying `pk` integer primary keys,
 * the iOS column layout, 1024-byte SQLite pages, and `PRAGMA user_version` 0.
 *
 * ## What this module deliberately is not
 *
 * It reads no journal, no file, no clock and no timezone — it takes the
 * converter's rows, so both dialect writers share one row set (the Android
 * half is `android-pinpal-dialect.ts`). Choosing the dialect from the device
 * the export runs on, naming the `.db` file, and handing the bytes to the
 * share sheet belong to the export hook.
 *
 * ## Why the layout is spelled out
 *
 * PinPal's iOS reader is strict about table names, column names, column order
 * and key types, so the DDL is written literally rather than derived. Every
 * line below is measured against the captain's real iOS backup
 * (`fixtures/pinpal/tj-ios.pinpal`, read in place and never committed): the
 * SQLite magic sits at byte offset 4096 behind a 792-byte ASCII plist and
 * 3304 NUL bytes of padding, the header carries page size 1024 and
 * `user_version` 0, there is no `android_metadata`, and the seven core tables
 * key on `pk` and omit every Android-only column — `sortOrder` (house,
 * pattern, ball, league), `lane` (week, game) and `pocket footBoard
 * targetBoard` (frame). The iOS table set is the Android set minus those
 * columns, so the same converter rows fill both.
 *
 * ## What the runtime cannot reproduce
 *
 * The fixture's header also carries schema format 3 at byte offset 44. That
 * field is SQLite's own schema-format version marker: the library sets it
 * while it builds or reloads a schema, and the only knob it exposes is
 * `SQLITE_DBCONFIG_LEGACY_FILE_FORMAT`, which forces the value 1 — a value
 * this writer must not emit either. Nothing in the SQL interface selects 3,
 * so the writer emits the value the runtime writes, 4, which is the value the
 * captain's Android backup carries. Page size and `user_version` are the
 * physical header fields that *are* settable, and both are set here.
 *
 * Rows are inserted in dependency order — house, pattern, ball, league,
 * week, game, frame — so every `…Fk` names a row that was already written,
 * and the padded frame slots take the iOS placeholder fill the converter
 * deliberately left null.
 */
import { openDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';

import { PINPAL_PLACEHOLDER_PINS_IOS } from '../../../services/local-journal/pinpal-backup-rows';

import type { PinPalLegacyRows } from '../../../services/local-journal/pinpal-backup-rows';

/** The 16 bytes every SQLite 3 image starts with. */
const SQLITE_MAGIC = 'SQLite format 3\u0000';

/**
 * Where the SQLite image sits inside the compound file — the same constant
 * the import detector sniffs (`file-validation.ts`
 * `PINPAL_LITE_SQLITE_OFFSET`), so a file this writer emits is a file that
 * detector reads back as `pinpal-lite-compound`.
 */
const IOS_COMPOUND_SQLITE_OFFSET = 4096;

/**
 * The database the image is built in. `:memory:` is expo-sqlite's in-memory
 * database (`pathUtils.createDatabasePath()` returns it unresolved), so the
 * writer never opens — and can never serialize — the journal's own
 * `bowling-journal.db`.
 */
const IOS_BACKUP_DATABASE_NAME = ':memory:';

/** The `PRAGMA user_version` the iOS fixture carries. */
const IOS_USER_VERSION = 0;

/**
 * The SQLite page size the iOS fixture's header carries. `PRAGMA page_size`
 * is honoured only while the database has not yet been created, so it is the
 * writer's first statement — see `android-pinpal-dialect.ts`, which leaves
 * the runtime default (4096, the Android fixture's page size) alone.
 */
const IOS_PAGE_SIZE = 1024;

/** The converter's `week.date` unit is epoch milliseconds; iOS stores seconds. */
const IOS_MILLISECONDS_PER_SECOND = 1000;

/**
 * PinPal Lite's iOS app-state plist: the 792 ASCII bytes the fixture carries
 * ahead of the SQLite image. PinPal writes its own settings dict there and
 * reads it back on import, so the wrapper is a fixed, known-good plist rather
 * than an invented one — arbitrary XML ahead of offset 4096 is not what the
 * fixture (or PinPal) shows.
 */
const IOS_APP_STATE_ENTRIES: [string, string][] = [
  ['DBVersion', '11'],
  ['DontShowAndroidReleaseMessage', '1'],
  ['DontShowEditChangeMessage', '1'],
  ['LastSelection', '0'],
  ['LastSelectionType', '0'],
  ['PinsDownByDefault', '1'],
  ['RatingNagCount', '4'],
  ['RatingNagCounter', '0'],
  ['RememberNavigation', '0'],
  ['ScoreModeIsDefault', '0'],
  ['ShowDataUnreadDot', '0'],
  ['WelcomeVersion', '2'],
];

/**
 * The seven core tables, in the order the writers declare them and with the
 * iOS fixture's exact column names and order — `pk` keys, and none of the
 * Android-only columns.
 */
const IOS_TABLE_DEFINITIONS = [
  'CREATE TABLE house (pk INTEGER PRIMARY KEY, name TEXT, flags INTEGER);',
  'CREATE TABLE pattern (pk INTEGER PRIMARY KEY, name TEXT, flags INTEGER);',
  'CREATE TABLE ball (pk INTEGER PRIMARY KEY, name TEXT, flags INTEGER);',
  'CREATE TABLE league (pk INTEGER PRIMARY KEY, ballFk INTEGER, patternFk INTEGER, houseFk INTEGER, name TEXT, games INTEGER, notes TEXT, flags INTEGER);',
  'CREATE TABLE week (pk INTEGER PRIMARY KEY, leagueFk INTEGER, ballFk INTEGER, patternFk INTEGER, houseFk INTEGER, date REAL, notes TEXT);',
  'CREATE TABLE game (pk INTEGER PRIMARY KEY, weekFk INTEGER, leagueFk INTEGER, ballFk INTEGER, patternFk INTEGER, houseFk INTEGER, score INTEGER, frame INTEGER, flags INTEGER, singlePinSpareScore INTEGER, notes TEXT);',
  'CREATE TABLE frame (pk INTEGER PRIMARY KEY, gameFk INTEGER, weekFk INTEGER, leagueFk INTEGER, ballFk INTEGER, frameNum INTEGER, pins INTEGER, scores INTEGER, score INTEGER, flags INTEGER);',
];

/** The insert for each core table, naming its columns explicitly. */
const IOS_INSERT_SQL = {
  house: 'INSERT INTO house (pk, name, flags) VALUES (?, ?, ?);',
  pattern: 'INSERT INTO pattern (pk, name, flags) VALUES (?, ?, ?);',
  ball: 'INSERT INTO ball (pk, name, flags) VALUES (?, ?, ?);',
  league:
    'INSERT INTO league (pk, ballFk, patternFk, houseFk, name, games, notes, flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
  week: 'INSERT INTO week (pk, leagueFk, ballFk, patternFk, houseFk, date, notes) VALUES (?, ?, ?, ?, ?, ?, ?);',
  game: 'INSERT INTO game (pk, weekFk, leagueFk, ballFk, patternFk, houseFk, score, frame, flags, singlePinSpareScore, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
  frame:
    'INSERT INTO frame (pk, gameFk, weekFk, leagueFk, ballFk, frameNum, pins, scores, score, flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
};

function hasMagicAt(bytes: Uint8Array, offset: number): boolean {
  if (bytes.length < offset + SQLITE_MAGIC.length) {
    return false;
  }

  for (let index = 0; index < SQLITE_MAGIC.length; index += 1) {
    if (bytes[offset + index] !== SQLITE_MAGIC.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

/**
 * The wrapper's first 4096 bytes: the app-state plist as ASCII bytes, then
 * NUL padding up to the offset where the SQLite image begins. The plist is
 * ASCII in the fixture, so the bytes are taken per character and a
 * non-ASCII entry is refused rather than silently mangled.
 */
function buildCompoundFileWrapper(): Uint8Array {
  const plist = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ' +
      '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    ...IOS_APP_STATE_ENTRIES.map(
      ([key, value]) => `\t<key>${key}</key>\n\t<string>${value}</string>`
    ),
    '</dict>',
    '</plist>',
    '',
  ].join('\n');

  if (plist.length > IOS_COMPOUND_SQLITE_OFFSET) {
    throw new Error(
      'The iOS app-state plist does not fit the 4096-byte compound-file wrapper.'
    );
  }

  const wrapper = new Uint8Array(IOS_COMPOUND_SQLITE_OFFSET);

  for (let index = 0; index < plist.length; index += 1) {
    const code = plist.charCodeAt(index);

    if (code > 127) {
      throw new Error(
        `The iOS app-state plist must be ASCII; character ${index} is not.`
      );
    }

    wrapper[index] = code;
  }

  return wrapper;
}

/**
 * Lay the converter's rows into a fresh iOS PinPal database and return the
 * SQLite image alone. Nothing in the journal is read or written: the image
 * comes entirely from the rows it is handed.
 */
async function buildIosSqliteImage(
  rows: PinPalLegacyRows
): Promise<Uint8Array> {
  const db: SQLiteDatabase = await openDatabaseAsync(IOS_BACKUP_DATABASE_NAME);

  try {
    await db.execAsync(`PRAGMA page_size = ${IOS_PAGE_SIZE};`);
    await db.execAsync('PRAGMA journal_mode = OFF;');
    await db.execAsync('PRAGMA synchronous = OFF;');
    await db.execAsync('BEGIN TRANSACTION;');
    await db.execAsync(`PRAGMA user_version = ${IOS_USER_VERSION};`);

    for (const definition of IOS_TABLE_DEFINITIONS) {
      await db.execAsync(definition);
    }

    for (const house of rows.houses) {
      await db.runAsync(IOS_INSERT_SQL.house, [
        house.sqliteId,
        house.name,
        house.flags,
      ]);
    }

    for (const pattern of rows.patterns) {
      await db.runAsync(IOS_INSERT_SQL.pattern, [
        pattern.sqliteId,
        pattern.name,
        pattern.flags,
      ]);
    }

    for (const ball of rows.balls) {
      await db.runAsync(IOS_INSERT_SQL.ball, [
        ball.sqliteId,
        ball.name,
        ball.flags,
      ]);
    }

    for (const league of rows.leagues) {
      await db.runAsync(IOS_INSERT_SQL.league, [
        league.sqliteId,
        league.ballFk,
        league.patternFk,
        league.houseFk,
        league.name,
        league.games,
        league.notes,
        league.flags,
      ]);
    }

    for (const week of rows.weeks) {
      await db.runAsync(IOS_INSERT_SQL.week, [
        week.sqliteId,
        week.leagueFk,
        week.ballFk,
        week.patternFk,
        week.houseFk,
        week.date === null ? null : week.date / IOS_MILLISECONDS_PER_SECOND,
        week.notes,
      ]);
    }

    for (const game of rows.games) {
      await db.runAsync(IOS_INSERT_SQL.game, [
        game.sqliteId,
        game.weekFk,
        game.leagueFk,
        game.ballFk,
        game.patternFk,
        game.houseFk,
        game.score,
        game.frame,
        game.flags,
        game.singlePinSpareScore,
        game.notes,
      ]);
    }

    for (const frame of rows.frames) {
      await db.runAsync(IOS_INSERT_SQL.frame, [
        frame.sqliteId,
        frame.gameFk,
        frame.weekFk,
        frame.leagueFk,
        frame.ballFk,
        frame.frameNum,
        frame.pins ?? PINPAL_PLACEHOLDER_PINS_IOS,
        frame.scores,
        frame.score,
        frame.flags,
      ]);
    }

    await db.execAsync('COMMIT;');

    return await db.serializeAsync();
  } finally {
    await db.closeAsync();
  }
}

/**
 * Lay the converter's rows into a fresh iOS PinPal database and return the
 * one compound artifact PinPal imports on an iOS device: the 4096-byte
 * wrapper, then the SQLite image with its own header untouched, so the
 * `SQLite format 3` magic sits at byte offset 4096 exactly as the fixture
 * and the import detector agree.
 *
 * @throws when the serialization is not a SQLite image, so a wrong artifact
 *         (the journal database itself, or nothing at all) is never shipped.
 */
export async function buildIosPinpalBackupImage(
  rows: PinPalLegacyRows
): Promise<Uint8Array> {
  const image = await buildIosSqliteImage(rows);
  const wrapper = buildCompoundFileWrapper();
  const artifact = new Uint8Array(wrapper.length + image.length);

  artifact.set(wrapper, 0);
  artifact.set(image, wrapper.length);

  if (!hasMagicAt(artifact, IOS_COMPOUND_SQLITE_OFFSET)) {
    throw new Error(
      'iOS backup image is not a SQLite database. PinPal cannot import it.'
    );
  }

  return artifact;
}
