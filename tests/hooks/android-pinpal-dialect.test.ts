/**
 * C-4 T2 — the Android PinPal dialect writer
 * (`src/hooks/journal/export-backup/android-pinpal-dialect.ts`).
 *
 * The real writer module runs with `expo-sqlite` remapped to
 * `./stubs/android-dialect-expo-sqlite-stub.mjs`, a `node:sqlite`-backed stub
 * that also implements expo-sqlite's `serializeAsync()` seam — it backs each
 * database with a temp file, so the stub hands back the same raw SQLite image
 * `sqlite3_serialize` returns on a device. The rows it is handed come from the
 * real converter, so the suite proves the Android container (DDL, keys,
 * pragma, placeholder fill, byte layout) rather than the row contract, which
 * `tests/local-journal/pinpal-backup-rows.test.ts` already pins.
 *
 * The image is read back through `node:sqlite` from its own temp file, so the
 * tables, column names and column order below are read from the deserialized
 * bytes — evidence rather than a restatement of the writer's own DDL. The
 * expected layout is the one measured from the captain's real Android backup
 * (`fixtures/pinpal/cortez-android.pinpal`, read in place and never
 * committed).
 *
 * Covered: the image opens with the `SQLite format 3` magic at offset zero;
 * `android_metadata` and the seven core tables carry the fixture's names,
 * columns and column order; `PRAGMA user_version` is 8; the image carries
 * exactly the converter's rows under the fixture's `_id` key — including the
 * Android `0xFFFFF` fill for padded frame slots and `week.date` as epoch
 * milliseconds rather than the journal's ISO text; every `…Fk` is non-null
 * and resolves to a row the image carries; the image is not the journal,
 * carrying none of the journal's own tables, and the writer opens only its
 * isolated in-memory database, never `bowling-journal.db`; and two exports of
 * an unchanged journal are byte-identical.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';

import {
  PINPAL_ABSENT_FOREIGN_KEY,
  PINPAL_OPEN_BOWLING_LEAGUE_KEY,
  PINPAL_PLACEHOLDER_PINS_ANDROID,
  buildPinPalLegacyRows,
} from '../../src/services/local-journal/pinpal-backup-rows';
import { registerStubRemaps } from '../harness/remap';

import type { JournalBackupData } from '../../src/services/local-journal/journal-backup-format';
import type { PinPalLegacyRows } from '../../src/services/local-journal/pinpal-backup-rows';

const stubRewrites: Record<string, string> = {
  'expo-sqlite': path.join(
    __dirname,
    'stubs',
    'android-dialect-expo-sqlite-stub.mjs'
  ),
};

const hookHandle = registerStubRemaps(() => stubRewrites);

const inspectionDirectory = mkdtempSync(
  path.join(tmpdir(), 'bj-android-dialect-image-')
);

let inspectionIndex = 0;

after(() => {
  hookHandle.deregister();
  rmSync(inspectionDirectory, { force: true, recursive: true });
});

type WriterModule =
  typeof import('../../src/hooks/journal/export-backup/android-pinpal-dialect');
type DatabaseModule = typeof import('../../src/db/database');

/** The 16 bytes every raw SQLite image starts with. */
const SQLITE_MAGIC = 'SQLite format 3\u0000';

/** SQLite's page size, which the Android fixture's header also carries. */
const SQLITE_PAGE_SIZE = 4096;

/**
 * The tables and column order measured from the captain's Android backup
 * (`sqlite3 -readonly fixtures/pinpal/cortez-android.pinpal .schema`), in the
 * order that file declares them.
 */
const ANDROID_FIXTURE_TABLES = [
  { name: 'android_metadata', columns: ['locale'] },
  { name: 'house', columns: ['_id', 'name', 'sortOrder', 'flags'] },
  { name: 'pattern', columns: ['_id', 'name', 'sortOrder', 'flags'] },
  { name: 'ball', columns: ['_id', 'name', 'sortOrder', 'flags'] },
  {
    name: 'league',
    columns: [
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
  },
  {
    name: 'week',
    columns: [
      '_id',
      'leagueFk',
      'ballFk',
      'patternFk',
      'houseFk',
      'date',
      'notes',
      'lane',
    ],
  },
  {
    name: 'game',
    columns: [
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
  },
  {
    name: 'frame',
    columns: [
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
];

/** The journal's own tables, none of which may appear in the image. */
const JOURNAL_TABLES = [
  'balls',
  'houses',
  'patterns',
  'leagues',
  'sessions',
  'games',
  'frames',
];

/** A timezone offset the caller would supply; the writer never reads one. */
const TIMEZONE_OFFSET_MINUTES = 120;

/**
 * A journal with one of everything: a league session (house, ball, pattern)
 * carrying a complete open game, and an open session with no league carrying
 * a game that stops after three frames. The partial game exercises the padded
 * frame slots PinPal expects, and the open session exercises the `-1` legacy
 * league key.
 */
function fixtureSnapshot(): JournalBackupData {
  const completeGameId = 'bbbbbbbb-1111-4111-8111-111111111111';
  const partialGameId = 'cccccccc-2222-4222-8222-222222222222';
  const ballId = 'dddddddd-3333-4333-8333-333333333333';
  const houseId = 'eeeeeeee-4444-4444-8444-444444444444';
  const patternId = 'ffffffff-5555-4555-8555-555555555555';
  const leagueId = '11111111-6666-4666-8666-666666666666';
  const leagueSessionId = '22222222-7777-4777-8777-777777777777';
  const openSessionId = '33333333-8888-4888-8888-888888888888';

  const frames: JournalBackupData['frames'] = [];

  const push = (
    gameId: string,
    frameNumber: number,
    roll1: number | null,
    roll2: number | null,
    roll3: number | null
  ) => {
    frames.push({
      id: `${gameId.slice(0, 8)}-0000-4000-8000-${String(frameNumber).padStart(
        12,
        '0'
      )}`,
      gameId,
      frameNumber,
      roll1Mask: roll1 === null ? null : (1 << roll1) - 1,
      roll2Mask: roll2 === null ? null : (1 << roll2) - 1,
      roll3Mask: roll3 === null ? null : (1 << roll3) - 1,
    });
  };

  for (let frameNumber = 1; frameNumber <= 9; frameNumber += 1) {
    push(completeGameId, frameNumber, 5, 3, null);
  }
  push(completeGameId, 10, 4, 5, null);

  for (let frameNumber = 1; frameNumber <= 3; frameNumber += 1) {
    push(partialGameId, frameNumber, 4, null, null);
  }

  return {
    balls: [{ id: ballId, name: 'Zen 25' }],
    houses: [{ id: houseId, name: 'Test House', location: 'Springfield' }],
    patterns: [{ id: patternId, name: 'Cheetah', length: 41 }],
    leagues: [
      {
        id: leagueId,
        name: 'Thursday Night',
        gamesPerSession: 3,
        houseId,
        houseName: 'Test House',
      },
    ],
    sessions: [
      {
        id: leagueSessionId,
        leagueId: leagueId,
        date: '2026-03-15',
        weekNumber: 2,
        houseId,
        ballId,
        patternId,
        notes: 'week 2',
      },
      { id: openSessionId, leagueId: null, date: '2026-03-14' },
    ],
    games: [
      {
        id: completeGameId,
        sessionId: leagueSessionId,
        date: '2026-03-15',
        houseId,
        ballId,
        patternId,
      },
      { id: partialGameId, sessionId: openSessionId, date: '2026-03-14' },
    ],
    frames,
  };
}

/** The rows the shared converter hands the dialect writer. */
function convertedRows(): PinPalLegacyRows {
  return buildPinPalLegacyRows(fixtureSnapshot(), TIMEZONE_OFFSET_MINUTES);
}

/** The converter's rows for one legacy table. */
function converterRows(rows: PinPalLegacyRows, table: string): unknown[] {
  switch (table) {
    case 'house':
      return [...rows.houses];
    case 'pattern':
      return [...rows.patterns];
    case 'ball':
      return [...rows.balls];
    case 'league':
      return [...rows.leagues];
    case 'week':
      return [...rows.weeks];
    case 'game':
      return [...rows.games];
    default:
      return [...rows.frames];
  }
}

let writerModulePromise: Promise<WriterModule> | null = null;

function getWriterModule(): Promise<WriterModule> {
  writerModulePromise ??=
    import('../../src/hooks/journal/export-backup/android-pinpal-dialect');

  return writerModulePromise;
}

async function exportAndroidImage(): Promise<Uint8Array> {
  const { buildAndroidPinpalBackupImage } = await getWriterModule();

  return buildAndroidPinpalBackupImage(convertedRows());
}

async function journalDatabaseName(): Promise<string> {
  const databaseModule: DatabaseModule = await import('../../src/db/database');

  return databaseModule.DATABASE_NAME;
}

// The image is read back through `node:sqlite` from its own temp file, which
// is what turns the bytes into evidence: the tables and columns below are
// read from the deserialized image, not from the writer's own DDL.
function withImage<T>(image: Uint8Array, read: (db: DatabaseSync) => T): T {
  const imagePath = path.join(
    inspectionDirectory,
    `image-${++inspectionIndex}.db`
  );

  writeFileSync(imagePath, image);

  const db = new DatabaseSync(imagePath);

  try {
    return read(db);
  } finally {
    db.close();
  }
}

function tableRows(db: DatabaseSync, table: string): Record<string, unknown>[] {
  return [...db.prepare(`SELECT * FROM ${table}`).all()].map((row) => ({
    ...row,
  }));
}

/**
 * The columns of a table, read from the deserialized image. An empty table
 * would carry no keys to read, which is why the suite refuses one.
 */
function columnNames(db: DatabaseSync, table: string): string[] {
  const rows = tableRows(db, table);

  if (rows.length === 0) {
    throw new Error(`Table ${table} is empty; its columns cannot be read.`);
  }

  return Object.keys(rows[0]);
}

function sqliteMagicOf(image: Uint8Array): string {
  return String.fromCharCode(...image.slice(0, SQLITE_MAGIC.length));
}

/**
 * The row the image must carry for one converter row: the converter's
 * `sqliteId` becomes the fixture's `_id` key, a padded slot's null `pins`
 * becomes the Android placeholder fill, and every other column is copied by
 * name.
 */
function expectedImageRow(
  row: unknown,
  columns: string[]
): Record<string, unknown> {
  const source = row as Record<string, unknown>;
  const expected: Record<string, unknown> = {};

  for (const column of columns) {
    if (column === '_id') {
      expected[column] = source.sqliteId;
      continue;
    }

    const value = source[column];

    expected[column] =
      column === 'pins' && value === null
        ? PINPAL_PLACEHOLDER_PINS_ANDROID
        : value;
  }

  return expected;
}

test('the image is a raw SQLite image with the magic at offset zero', async () => {
  const image = await exportAndroidImage();

  assert.ok(image instanceof Uint8Array);
  assert.ok(image.length > 0);
  assert.strictEqual(sqliteMagicOf(image), SQLITE_MAGIC);
  assert.strictEqual((image[16] << 8) | image[17], SQLITE_PAGE_SIZE);
});

test('android_metadata and the seven core tables match the Android fixture layout', async () => {
  const image = await exportAndroidImage();

  const layout = withImage(image, (db) =>
    ANDROID_FIXTURE_TABLES.map((table) => ({
      name: table.name,
      columns: columnNames(db, table.name),
    }))
  );

  assert.deepStrictEqual(layout, ANDROID_FIXTURE_TABLES);
});

test('the image carries the Android user_version and one android_metadata row', async () => {
  const image = await exportAndroidImage();

  const observed = withImage(image, (db) => ({
    userVersion: { ...db.prepare('PRAGMA user_version').get() },
    metadata: tableRows(db, 'android_metadata'),
  }));

  assert.deepStrictEqual(observed, {
    userVersion: { user_version: 8 },
    metadata: [{ locale: 'en_US' }],
  });
});

test('the image carries exactly the converter rows under the fixture _id key', async () => {
  const rows = convertedRows();
  const image = await exportAndroidImage();

  const coreTables = ANDROID_FIXTURE_TABLES.filter(
    (table) => table.name !== 'android_metadata'
  );

  const observed = withImage(image, (db) =>
    coreTables.map((table) => ({
      name: table.name,
      rows: tableRows(db, table.name),
    }))
  );

  const expected = coreTables.map((table) => ({
    name: table.name,
    rows: converterRows(rows, table.name).map((row) =>
      expectedImageRow(row, table.columns)
    ),
  }));

  assert.deepStrictEqual(observed, expected);
  assert.strictEqual(rows.frames.length, rows.games.length * 12);
});

test('week dates are epoch milliseconds and padded slots carry the Android fill', async () => {
  const rows = convertedRows();
  const image = await exportAndroidImage();

  const paddedSlots = rows.frames.filter((frame) => frame.flags === 0).length;

  const observed = withImage(image, (db) => ({
    dates: tableRows(db, 'week').map((row) => row.date),
    paddedPins: tableRows(db, 'frame')
      .filter((row) => row.flags === 0)
      .map((row) => row.pins),
  }));

  assert.deepStrictEqual(
    observed.dates,
    rows.weeks.map((week) => week.date)
  );
  assert.deepStrictEqual(observed.dates, [
    Date.parse('2026-03-15T00:00:00.000Z') + TIMEZONE_OFFSET_MINUTES * 60_000,
    Date.parse('2026-03-14T00:00:00.000Z') + TIMEZONE_OFFSET_MINUTES * 60_000,
  ]);
  assert.strictEqual(observed.paddedPins.length, paddedSlots);
  assert.ok(
    observed.paddedPins.every(
      (pins) => pins === PINPAL_PLACEHOLDER_PINS_ANDROID
    )
  );
});

test('every foreign key is non-null and resolves to a row the image carries', async () => {
  const image = await exportAndroidImage();

  const observed = withImage(image, (db) => {
    const keys = new Set<number>();

    for (const table of ANDROID_FIXTURE_TABLES) {
      if (table.name === 'android_metadata') {
        continue;
      }

      for (const row of tableRows(db, table.name)) {
        keys.add(Number(row._id));
      }
    }

    const dangling: string[] = [];
    const nullKeys: string[] = [];

    for (const table of ANDROID_FIXTURE_TABLES) {
      for (const row of tableRows(db, table.name)) {
        for (const [column, value] of Object.entries(row)) {
          if (!column.endsWith('Fk')) {
            continue;
          }

          if (value === null) {
            nullKeys.push(`${table.name}.${column}`);
          } else if (
            value !== PINPAL_ABSENT_FOREIGN_KEY &&
            value !== PINPAL_OPEN_BOWLING_LEAGUE_KEY &&
            !keys.has(Number(value))
          ) {
            dangling.push(`${table.name}.${column}=${value}`);
          }
        }
      }
    }

    return {
      keys: keys.size,
      dangling,
      nullKeys,
      frameOwners: tableRows(db, 'frame').map((row) => [
        Number(row.gameFk),
        Number(row.weekFk),
      ]),
    };
  });

  assert.deepStrictEqual(observed.dangling, []);
  assert.deepStrictEqual(observed.nullKeys, []);
  assert.strictEqual(observed.frameOwners.length, 24);
  assert.ok(
    observed.frameOwners.every(([gameFk, weekFk]) => gameFk > 0 && weekFk > 0)
  );
});

/** The database the writer builds its image in, never the journal's. */
const ISOLATED_BACKUP_DATABASE_NAME = ':memory:';

test('the image is not the journal and never carries the journal tables', async () => {
  const image = await exportAndroidImage();
  const journalName = await journalDatabaseName();

  const openedNames: string[] = (globalThis as Record<string, unknown>)[
    '__androidDialectOpenedDatabaseNames'
  ] as string[];

  const missingJournalTables = withImage(image, (db) =>
    JOURNAL_TABLES.filter((table) => {
      try {
        db.prepare(`SELECT * FROM ${table}`);
        return false;
      } catch {
        return true;
      }
    })
  );

  assert.deepStrictEqual(missingJournalTables, JOURNAL_TABLES);
  assert.ok(openedNames.length > 0);
  assert.ok(
    openedNames.every(
      (name) => name === ISOLATED_BACKUP_DATABASE_NAME && name !== journalName
    )
  );
});

test('two exports of an unchanged journal are byte-identical', async () => {
  const first = await exportAndroidImage();
  const second = await exportAndroidImage();

  assert.strictEqual(first.length, second.length);
  assert.ok(first.every((byte, index) => byte === second[index]));
});
