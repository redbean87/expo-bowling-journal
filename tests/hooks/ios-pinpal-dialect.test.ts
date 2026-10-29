/**
 * C-4 T3 — the iOS PinPal dialect writer
 * (`src/hooks/journal/export-backup/ios-pinpal-dialect.ts`).
 *
 * The real writer module runs with `expo-sqlite` remapped to
 * `./stubs/ios-dialect-expo-sqlite-stub.mjs`, a `node:sqlite`-backed stub that
 * implements expo-sqlite's `serializeAsync()` seam — it backs each database
 * with a temp file, so the stub hands back the same raw SQLite image
 * `sqlite3_serialize` returns on a device. The rows it is handed come from the
 * real converter, so the suite proves the iOS container (wrapper, DDL, keys,
 * page size, placeholder fill, byte layout) rather than the row contract,
 * which `tests/local-journal/pinpal-backup-rows.test.ts` already pins.
 *
 * The SQLite image is read back through `node:sqlite` from its own temp file,
 * so the tables and column names below are read from the deserialized bytes —
 * evidence rather than a restatement of the writer's own DDL. The expected
 * layout is the one measured from the captain's real iOS backup
 * (`fixtures/pinpal/tj-ios.pinpal`, read in place and never committed).
 *
 * Covered: the artifact opens with the plist declaration at offset zero and
 * carries the `SQLite format 3` magic at byte offset 4096 — the shape
 * `src/hooks/journal/import-backup/file-validation.ts` sniffs as
 * `pinpal-lite-compound`, which the suite confirms by running the artifact
 * through that detector; the wrapper is exactly 4096 bytes of ASCII plist
 * followed by NUL padding; the image carries the seven core tables with the
 * fixture's `pk` keys and its exact columns and column order, and none of the
 * Android-only columns (`sortOrder`, `lane`, `pocket`, `footBoard`,
 * `targetBoard`) or the `android_metadata` table; the image header carries
 * page size 1024 and `PRAGMA user_version` 0, and its schema-format field is
 * the value the runtime writes (4, the Android fixture's value — the fixture's
 * 3 is not selectable from the SQL interface, see the writer's own note); the
 * image carries exactly the converter's rows under the fixture's `pk` key,
 * including the iOS `0x3FFFFFF` fill for padded frame slots and `week.date` as
 * epoch **seconds** rather than the converter's epoch milliseconds; every
 * `…Fk` is non-null and resolves to a row the image carries; the image is not
 * the journal, carrying none of the journal's own tables, and the writer opens
 * only its isolated in-memory database, never `bowling-journal.db`; and two
 * exports of an unchanged journal are byte-identical.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';

import { detectBackupFormat } from '../../src/hooks/journal/import-backup/file-validation';
import {
  PINPAL_ABSENT_FOREIGN_KEY,
  PINPAL_OPEN_BOWLING_LEAGUE_KEY,
  PINPAL_PLACEHOLDER_PINS_IOS,
  buildPinPalLegacyRows,
} from '../../src/services/local-journal/pinpal-backup-rows';
import { registerStubRemaps } from '../harness/remap';

import type { JournalBackupData } from '../../src/services/local-journal/journal-backup-format';
import type { PinPalLegacyRows } from '../../src/services/local-journal/pinpal-backup-rows';

const stubRewrites: Record<string, string> = {
  'expo-sqlite': path.join(
    __dirname,
    'stubs',
    'ios-dialect-expo-sqlite-stub.mjs'
  ),
};

const hookHandle = registerStubRemaps(() => stubRewrites);

const inspectionDirectory = mkdtempSync(
  path.join(tmpdir(), 'bj-ios-dialect-image-')
);

let inspectionIndex = 0;

after(() => {
  hookHandle.deregister();
  rmSync(inspectionDirectory, { force: true, recursive: true });
});

type WriterModule =
  typeof import('../../src/hooks/journal/export-backup/ios-pinpal-dialect');
type DatabaseModule = typeof import('../../src/db/database');

/** The 16 bytes every SQLite image starts with. */
const SQLITE_MAGIC = 'SQLite format 3\u0000';

/** Where the SQLite image sits inside the compound artifact. */
const SQLITE_OFFSET = 4096;

/** The first bytes of the plist wrapper the fixture carries. */
const PLIST_OPENING = '<?xml version="1.0" encoding="UTF-8"?>';

/** The last bytes of the plist text, before the NUL padding. */
const PLIST_CLOSING = '</plist>\n';

/** The SQLite page size the iOS fixture's header carries. */
const IOS_PAGE_SIZE = 1024;

/**
 * The schema-format field (header bytes 44-47) the SQLite build writes for a
 * freshly created database. The iOS fixture carries 3, written by PinPal's own
 * schema reload; the SQL interface exposes no way to select that value, so the
 * writer ships the value the runtime writes — 4, the same value the captain's
 * Android backup carries.
 */
const SQLITE_SCHEMA_FORMAT_WRITER_EMITS = 4;

/** The converter's `week.date` unit; iOS stores seconds, not milliseconds. */
const MILLISECONDS_PER_SECOND = 1000;

/**
 * The tables and column order measured from the captain's iOS backup
 * (`sqlite3 -readonly` over the image at offset 4096, read in place), for the
 * seven core tables. The iOS dialect has no `android_metadata`, keys on `pk`,
 * and carries none of the Android-only columns.
 */
const IOS_FIXTURE_TABLES = [
  { name: 'house', columns: ['pk', 'name', 'flags'] },
  { name: 'pattern', columns: ['pk', 'name', 'flags'] },
  { name: 'ball', columns: ['pk', 'name', 'flags'] },
  {
    name: 'league',
    columns: [
      'pk',
      'ballFk',
      'patternFk',
      'houseFk',
      'name',
      'games',
      'notes',
      'flags',
    ],
  },
  {
    name: 'week',
    columns: [
      'pk',
      'leagueFk',
      'ballFk',
      'patternFk',
      'houseFk',
      'date',
      'notes',
    ],
  },
  {
    name: 'game',
    columns: [
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
  },
  {
    name: 'frame',
    columns: [
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
];

/** The columns only the Android dialect carries, none of which may appear. */
const ANDROID_ONLY_COLUMNS = [
  'sortOrder',
  'lane',
  'pocket',
  'footBoard',
  'targetBoard',
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
    import('../../src/hooks/journal/export-backup/ios-pinpal-dialect');

  return writerModulePromise;
}

async function exportIosArtifact(): Promise<Uint8Array> {
  const { buildIosPinpalBackupImage } = await getWriterModule();

  return buildIosPinpalBackupImage(convertedRows());
}

async function journalDatabaseName(): Promise<string> {
  const databaseModule: DatabaseModule = await import('../../src/db/database');

  return databaseModule.DATABASE_NAME;
}

/** The SQLite image alone, read out of the compound artifact at offset 4096. */
function sqliteImageOf(artifact: Uint8Array): Uint8Array {
  return artifact.slice(SQLITE_OFFSET);
}

// The image is read back through `node:sqlite` from its own temp file, which
// is what turns the bytes into evidence: the tables and columns below are
// read from the deserialized image, not from the writer's own DDL. Only the
// image is written out — the compound artifact itself is not a database
// `node:sqlite` could open.
function withImage<T>(artifact: Uint8Array, read: (db: DatabaseSync) => T): T {
  const imagePath = path.join(
    inspectionDirectory,
    `image-${++inspectionIndex}.db`
  );

  writeFileSync(imagePath, sqliteImageOf(artifact));

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

function textOf(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function sqliteMagicOf(artifact: Uint8Array): string {
  return textOf(artifact, SQLITE_OFFSET, SQLITE_OFFSET + SQLITE_MAGIC.length);
}

/**
 * The row the image must carry for one converter row: the converter's
 * `sqliteId` becomes the fixture's `pk` key, a padded slot's null `pins`
 * becomes the iOS placeholder fill, `week.date` goes from the converter's
 * epoch milliseconds to the fixture's epoch seconds, and every other column
 * is copied by name.
 */
function expectedImageRow(
  row: unknown,
  columns: string[]
): Record<string, unknown> {
  const source = row as Record<string, unknown>;
  const expected: Record<string, unknown> = {};

  for (const column of columns) {
    if (column === 'pk') {
      expected[column] = source.sqliteId;
      continue;
    }

    const value = source[column];

    if (column === 'date' && typeof value === 'number') {
      expected[column] = value / MILLISECONDS_PER_SECOND;
    } else {
      expected[column] =
        column === 'pins' && value === null
          ? PINPAL_PLACEHOLDER_PINS_IOS
          : value;
    }
  }

  return expected;
}

test('the artifact is the compound file: plist at zero, SQLite magic at offset 4096', async () => {
  const artifact = await exportIosArtifact();

  assert.ok(artifact instanceof Uint8Array);
  assert.ok(artifact.length > SQLITE_OFFSET + SQLITE_MAGIC.length);
  assert.strictEqual(textOf(artifact, 0, PLIST_OPENING.length), PLIST_OPENING);
  assert.strictEqual(sqliteMagicOf(artifact), SQLITE_MAGIC);
  assert.strictEqual(
    sqliteImageOf(artifact).length % IOS_PAGE_SIZE,
    0,
    `the image is not a whole number of ${IOS_PAGE_SIZE}-byte pages`
  );
});

test('the wrapper is 4096 bytes of plist text followed by NUL padding', async () => {
  const artifact = await exportIosArtifact();

  const wrapperText = textOf(artifact, 0, SQLITE_OFFSET);
  const closingIndex = wrapperText.lastIndexOf(PLIST_CLOSING);

  assert.ok(closingIndex >= 0, 'the plist text never closes');
  assert.strictEqual(
    closingIndex,
    wrapperText.indexOf(PLIST_CLOSING),
    'the plist closes more than once'
  );
  assert.ok(
    closingIndex + PLIST_CLOSING.length < SQLITE_OFFSET,
    'the plist text leaves no room for padding'
  );
  assert.ok(
    artifact
      .slice(closingIndex + PLIST_CLOSING.length, SQLITE_OFFSET)
      .every((byte) => byte === 0),
    'something other than NUL padding follows the plist'
  );
});

test('the artifact is the format the import detector already reads', async () => {
  const artifact = await exportIosArtifact();

  const format = await detectBackupFormat(
    new Blob([artifact.slice(0, artifact.length)])
  );

  assert.strictEqual(format, 'pinpal-lite-compound');
});

test('the seven core tables match the iOS fixture layout', async () => {
  const artifact = await exportIosArtifact();

  const layout = withImage(artifact, (db) =>
    IOS_FIXTURE_TABLES.map((table) => ({
      name: table.name,
      columns: columnNames(db, table.name),
    }))
  );

  assert.deepStrictEqual(layout, IOS_FIXTURE_TABLES);

  const androidOnly = IOS_FIXTURE_TABLES.flatMap((table) =>
    ANDROID_ONLY_COLUMNS.filter((column) => table.columns.includes(column))
  );

  assert.deepStrictEqual(androidOnly, []);
});

test('the image carries the iOS page size, schema format and user_version', async () => {
  const artifact = await exportIosArtifact();
  const image = sqliteImageOf(artifact);

  assert.strictEqual(
    (image[16] << 8) | image[17],
    IOS_PAGE_SIZE,
    'the image header does not carry the iOS page size'
  );
  assert.strictEqual(
    (image[44] << 24) | (image[45] << 16) | (image[46] << 8) | image[47],
    SQLITE_SCHEMA_FORMAT_WRITER_EMITS,
    'the image header does not carry the schema format the writer emits'
  );

  const observed = withImage(artifact, (db) => ({
    ...db.prepare('PRAGMA user_version').get(),
    metadata: (() => {
      try {
        db.prepare('SELECT * FROM android_metadata');
        return 'present';
      } catch {
        return 'absent';
      }
    })(),
  }));

  assert.deepStrictEqual(observed, {
    user_version: 0,
    metadata: 'absent',
  });
});

test('the image carries exactly the converter rows under the fixture pk key', async () => {
  const rows = convertedRows();
  const artifact = await exportIosArtifact();

  const observed = withImage(artifact, (db) =>
    IOS_FIXTURE_TABLES.map((table) => ({
      name: table.name,
      rows: tableRows(db, table.name),
    }))
  );

  const expected = IOS_FIXTURE_TABLES.map((table) => ({
    name: table.name,
    rows: converterRows(rows, table.name).map((row) =>
      expectedImageRow(row, table.columns)
    ),
  }));

  assert.deepStrictEqual(observed, expected);
  assert.strictEqual(rows.frames.length, rows.games.length * 12);
});

test('week dates are epoch seconds and padded slots carry the iOS fill', async () => {
  const rows = convertedRows();
  const artifact = await exportIosArtifact();

  const paddedSlots = rows.frames.filter((frame) => frame.flags === 0).length;

  const observed = withImage(artifact, (db) => ({
    dates: tableRows(db, 'week').map((row) => row.date),
    paddedPins: tableRows(db, 'frame')
      .filter((row) => row.flags === 0)
      .map((row) => row.pins),
  }));

  assert.deepStrictEqual(
    observed.dates,
    rows.weeks.map((week) =>
      week.date === null ? null : week.date / MILLISECONDS_PER_SECOND
    )
  );
  assert.deepStrictEqual(observed.dates, [
    Date.parse('2026-03-15T00:00:00.000Z') / MILLISECONDS_PER_SECOND +
      TIMEZONE_OFFSET_MINUTES * 60,
    Date.parse('2026-03-14T00:00:00.000Z') / MILLISECONDS_PER_SECOND +
      TIMEZONE_OFFSET_MINUTES * 60,
  ]);
  assert.strictEqual(observed.paddedPins.length, paddedSlots);
  assert.ok(
    observed.paddedPins.every((pins) => pins === PINPAL_PLACEHOLDER_PINS_IOS)
  );
});

test('every foreign key is non-null and resolves to a row the image carries', async () => {
  const artifact = await exportIosArtifact();

  const observed = withImage(artifact, (db) => {
    const keys = new Set<number>();

    for (const table of IOS_FIXTURE_TABLES) {
      for (const row of tableRows(db, table.name)) {
        keys.add(Number(row.pk));
      }
    }

    const dangling: string[] = [];
    const nullKeys: string[] = [];

    for (const table of IOS_FIXTURE_TABLES) {
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
  const artifact = await exportIosArtifact();
  const journalName = await journalDatabaseName();

  const openedNames: string[] = (globalThis as Record<string, unknown>)[
    '__iosDialectOpenedDatabaseNames'
  ] as string[];

  const missingJournalTables = withImage(artifact, (db) =>
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
  const first = await exportIosArtifact();
  const second = await exportIosArtifact();

  assert.strictEqual(first.length, second.length);
  assert.ok(first.every((byte, index) => byte === second[index]));
});
