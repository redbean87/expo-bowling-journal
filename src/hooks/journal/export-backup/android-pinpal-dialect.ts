/**
 * C-4 T2 — the Android PinPal dialect writer (app-side).
 *
 * `@/services/local-journal/pinpal-backup-rows` turns the local journal into
 * the seven legacy PinPal entity tables; this module is the Android half of
 * the container that wraps those rows. It lays them into a fresh, isolated
 * SQLite database and returns the raw image PinPal imports on an Android
 * device: `android_metadata`, `_id` integer primary keys, the fixture's
 * column layout, and `PRAGMA user_version = 8`.
 *
 * ## What this module deliberately is not
 *
 * It reads no journal, no file, no clock and no timezone — it takes the
 * converter's rows, so the iOS dialect (the plist wrapper, `pk` keys, 1024
 * byte pages, `user_version` 0) can share one row set. Choosing the dialect
 * from the device the export runs on, naming the `.db` file, and handing the
 * bytes to the share sheet belong to the export hook.
 *
 * ## Why the layout is spelled out
 *
 * PinPal's Android reader is strict about table names, column names, column
 * order and key types, so the DDL is written literally rather than derived.
 * Every line below is measured against the captain's real Android backup
 * (`fixtures/pinpal/cortez-android.pinpal`: a raw SQLite image at offset 0,
 * page size 4096, `PRAGMA user_version` 8, one `android_metadata` row
 * holding `en_US`, no NULL in any `…Fk` column, and padded frame slots
 * carrying `pins` 0xFFFFF) and matches the DDL the server-side exporter has
 * always emitted (`worker/src/sqlite_exporter.js:118-173`, untouched here).
 *
 * Rows are inserted in dependency order — house, pattern, ball, league,
 * week, game, frame — so every `…Fk` names a row that was already written,
 * and the padded frame slots take the Android placeholder fill the
 * converter deliberately left null.
 */
import { openDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';

import { PINPAL_PLACEHOLDER_PINS_ANDROID } from '../../../services/local-journal/pinpal-backup-rows';

import type { PinPalLegacyRows } from '../../../services/local-journal/pinpal-backup-rows';

/** The 16 bytes every raw SQLite image starts with. */
const SQLITE_MAGIC = 'SQLite format 3\u0000';

/**
 * The database the image is built in. `:memory:` is expo-sqlite's in-memory
 * database (`pathUtils.createDatabasePath()` returns it unresolved), so the
 * writer never opens — and can never serialize — the journal's own
 * `bowling-journal.db`.
 */
const ANDROID_BACKUP_DATABASE_NAME = ':memory:';

/** The `PRAGMA user_version` the Android fixture carries. */
const ANDROID_USER_VERSION = 8;

/** The `android_metadata` locale the fixture and the legacy exporter use. */
const ANDROID_METADATA_LOCALE = 'en_US';

/**
 * The `android_metadata` table and its one row, as PinPal's Android backups
 * carry them.
 */
const ANDROID_METADATA_SQL = [
  'CREATE TABLE android_metadata (locale TEXT);',
  `INSERT INTO android_metadata (locale) VALUES ('${ANDROID_METADATA_LOCALE}');`,
];

/**
 * The seven core tables, in the order the Android fixture declares them and
 * with its exact column names and order.
 */
const ANDROID_TABLE_DEFINITIONS = [
  'CREATE TABLE house (_id INTEGER PRIMARY KEY, name TEXT, sortOrder INTEGER, flags INTEGER);',
  'CREATE TABLE pattern (_id INTEGER PRIMARY KEY, name TEXT, sortOrder INTEGER, flags INTEGER);',
  'CREATE TABLE ball (_id INTEGER PRIMARY KEY, name TEXT, sortOrder INTEGER, flags INTEGER);',
  'CREATE TABLE league (_id INTEGER PRIMARY KEY, ballFk INTEGER, patternFk INTEGER, houseFk INTEGER, name TEXT, games INTEGER, notes TEXT, sortOrder INTEGER, flags INTEGER);',
  'CREATE TABLE week (_id INTEGER PRIMARY KEY, leagueFk INTEGER, ballFk INTEGER, patternFk INTEGER, houseFk INTEGER, date REAL, notes TEXT, lane INTEGER);',
  'CREATE TABLE game (_id INTEGER PRIMARY KEY, weekFk INTEGER, leagueFk INTEGER, ballFk INTEGER, patternFk INTEGER, houseFk INTEGER, score INTEGER, frame INTEGER, flags INTEGER, singlePinSpareScore INTEGER, notes TEXT, lane INTEGER);',
  'CREATE TABLE frame (_id INTEGER PRIMARY KEY, gameFk INTEGER, weekFk INTEGER, leagueFk INTEGER, ballFk INTEGER, frameNum INTEGER, pins INTEGER, scores INTEGER, score INTEGER, flags INTEGER, pocket INTEGER, footBoard INTEGER, targetBoard INTEGER);',
];

/** The insert for each core table, naming its columns explicitly. */
const ANDROID_INSERT_SQL = {
  house: 'INSERT INTO house (_id, name, sortOrder, flags) VALUES (?, ?, ?, ?);',
  pattern:
    'INSERT INTO pattern (_id, name, sortOrder, flags) VALUES (?, ?, ?, ?);',
  ball: 'INSERT INTO ball (_id, name, sortOrder, flags) VALUES (?, ?, ?, ?);',
  league:
    'INSERT INTO league (_id, ballFk, patternFk, houseFk, name, games, notes, sortOrder, flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);',
  week: 'INSERT INTO week (_id, leagueFk, ballFk, patternFk, houseFk, date, notes, lane) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
  game: 'INSERT INTO game (_id, weekFk, leagueFk, ballFk, patternFk, houseFk, score, frame, flags, singlePinSpareScore, notes, lane) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
  frame:
    'INSERT INTO frame (_id, gameFk, weekFk, leagueFk, ballFk, frameNum, pins, scores, score, flags, pocket, footBoard, targetBoard) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
};

function hasSqliteMagic(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_MAGIC.length) {
    return false;
  }

  for (let index = 0; index < SQLITE_MAGIC.length; index += 1) {
    if (bytes[index] !== SQLITE_MAGIC.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

/**
 * Lay the converter's rows into a fresh Android PinPal database and return
 * the raw SQLite image, starting with the `SQLite format 3` magic at offset
 * zero. Nothing in the journal is read or written: the image comes entirely
 * from the rows it is handed.
 *
 * @throws when the serialization is not a SQLite image, so a wrong artifact
 *         (the journal database itself, or nothing at all) is never shipped.
 */
export async function buildAndroidPinpalBackupImage(
  rows: PinPalLegacyRows
): Promise<Uint8Array> {
  const db: SQLiteDatabase = await openDatabaseAsync(
    ANDROID_BACKUP_DATABASE_NAME
  );

  try {
    await db.execAsync('PRAGMA journal_mode = OFF;');
    await db.execAsync('PRAGMA synchronous = OFF;');
    await db.execAsync('BEGIN TRANSACTION;');
    await db.execAsync(`PRAGMA user_version = ${ANDROID_USER_VERSION};`);

    for (const sql of ANDROID_METADATA_SQL) {
      await db.execAsync(sql);
    }

    for (const definition of ANDROID_TABLE_DEFINITIONS) {
      await db.execAsync(definition);
    }

    for (const house of rows.houses) {
      await db.runAsync(ANDROID_INSERT_SQL.house, [
        house.sqliteId,
        house.name,
        house.sortOrder,
        house.flags,
      ]);
    }

    for (const pattern of rows.patterns) {
      await db.runAsync(ANDROID_INSERT_SQL.pattern, [
        pattern.sqliteId,
        pattern.name,
        pattern.sortOrder,
        pattern.flags,
      ]);
    }

    for (const ball of rows.balls) {
      await db.runAsync(ANDROID_INSERT_SQL.ball, [
        ball.sqliteId,
        ball.name,
        ball.sortOrder,
        ball.flags,
      ]);
    }

    for (const league of rows.leagues) {
      await db.runAsync(ANDROID_INSERT_SQL.league, [
        league.sqliteId,
        league.ballFk,
        league.patternFk,
        league.houseFk,
        league.name,
        league.games,
        league.notes,
        league.sortOrder,
        league.flags,
      ]);
    }

    for (const week of rows.weeks) {
      await db.runAsync(ANDROID_INSERT_SQL.week, [
        week.sqliteId,
        week.leagueFk,
        week.ballFk,
        week.patternFk,
        week.houseFk,
        week.date,
        week.notes,
        week.lane,
      ]);
    }

    for (const game of rows.games) {
      await db.runAsync(ANDROID_INSERT_SQL.game, [
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
        game.lane,
      ]);
    }

    for (const frame of rows.frames) {
      await db.runAsync(ANDROID_INSERT_SQL.frame, [
        frame.sqliteId,
        frame.gameFk,
        frame.weekFk,
        frame.leagueFk,
        frame.ballFk,
        frame.frameNum,
        frame.pins ?? PINPAL_PLACEHOLDER_PINS_ANDROID,
        frame.scores,
        frame.score,
        frame.flags,
        frame.pocket,
        frame.footBoard,
        frame.targetBoard,
      ]);
    }

    await db.execAsync('COMMIT;');

    const image = await db.serializeAsync();

    if (!hasSqliteMagic(image)) {
      throw new Error(
        'Android backup image is not a SQLite database. PinPal cannot import it.'
      );
    }

    return image;
  } finally {
    await db.closeAsync();
  }
}
