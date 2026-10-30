/**
 * C-4 T5-R — the PinPal `.db` READER driven by the captain's REAL backups.
 *
 * `tests/local-journal/pinpal-backup-import.test.ts` builds its images from
 * the two dialect WRITERS, so every byte it feeds the reader is a byte this
 * repository wrote — including the DDL, which we emit unquoted
 * (`_id INTEGER PRIMARY KEY`). A reader check that only understands our own
 * spelling passes that suite forever, which is exactly how a foreign writer's
 * file got refused: PinPal writes its key column quoted —
 * `'_id' INTEGER PRIMARY KEY`, as `sqlite3 -readonly fixtures/pinpal/cortez-android.pinpal .schema`
 * shows — and a text check for `_id` immediately followed by `INTEGER` never
 * sees it. This suite closes that gap by driving the real files through
 * `readPinPalBackupImage` end to end, and by pinning the reader against DDL
 * spellings no writer in this repository produces.
 *
 * ## The fixtures are personal, untracked, and read-only
 *
 * `fixtures/pinpal/cortez-android.pinpal` and `fixtures/pinpal/tj-ios.pinpal`
 * are the captain's own bowling data: they live in the primary clone, are
 * never committed or copied into a tracked path, and are only ever read. The
 * suite locates the primary clone through this clone's own `.git` pointer
 * (the same route `tests/hooks/pinpal-dialect-fixture-compat.test.ts` uses),
 * so the same real file is read from every worktree, and every test that
 * depends on a fixture reports an explicit skip when that file is absent.
 *
 * ## What is covered
 *
 * Both real files are accepted and named — the raw Android image at offset
 * zero as `android`, the plist-wrapped compound image with SQLite at offset
 * 4096 as `ios` — and each one's rows come back in the counts the file itself
 * holds, read straight off the fixture rather than restated here. The
 * fixture's own DDL is quoted, which is the spelling the old text check could
 * not see, so the acceptance below is evidence about a foreign writer rather
 * than about ours. Quoting (`'`, `"`, backtick, none), keyword casing and
 * whitespace are then varied over synthetic foreign images carrying the same
 * seven tables, and every spelling is named the same dialect. A file that
 * genuinely is not a PinPal backup is still refused with the same clear
 * message: the journal's own database, a table that carries an `_id` column
 * which is NOT its primary key, and a `.json` envelope wearing a `.db` name,
 * all fail before any dialect is named.
 */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';

import { registerStubRemaps } from '../harness/remap';

import type { PinpalBackupImage } from '../../src/services/local-journal/pinpal-backup-import';
import type { PinPalLegacyRows } from '../../src/services/local-journal/pinpal-backup-rows';

type PinpalImportModule =
  typeof import('../../src/services/local-journal/pinpal-backup-import');

/**
 * The importer is loaded dynamically, the way the sibling import suite does:
 * the module statically imports `deserializeDatabaseAsync` from `expo-sqlite`,
 * and that specifier can only be remapped once this file's hooks are
 * registered, which happens after this file's own static imports.
 */
async function pinpalModule(): Promise<PinpalImportModule> {
  return (await import('../../src/services/local-journal/pinpal-backup-import')) as PinpalImportModule;
}

async function readPinPalBackupImage(
  bytes: Uint8Array
): Promise<PinpalBackupImage> {
  return (await pinpalModule()).readPinPalBackupImage(bytes);
}

/**
 * The same `node:sqlite`-backed stub the sibling import suite ships: it
 * implements expo-sqlite's `deserializeDatabaseAsync()` by writing the image
 * it is handed to its own temp file and opening it, so the reader sees the
 * same bytes and the same "file is not a database" failure a corrupt image
 * produces on a device. Reused rather than duplicated: this suite adds no
 * second stub and no second runner.
 */
const stubRewrites: Record<string, string> = {
  'expo-sqlite': join(__dirname, 'stubs', 'pinpal-import-expo-sqlite-stub.mjs'),
};

const hookHandle = registerStubRemaps(() => stubRewrites);

/** Scratch directory for synthetic images and iOS image copies; never tracked. */
const scratchDirectory = mkdtempSync(
  join(tmpdir(), 'bj-pinpal-foreign-writer-')
);

let scratchIndex = 0;

after(() => {
  hookHandle.deregister();
  rmSync(scratchDirectory, { force: true, recursive: true });
});

/** Byte offset of the SQLite magic inside an iOS compound file. */
const COMPOUND_SQLITE_OFFSET = 4096;

/** The seven legacy tables, in the order the reader requires them. */
const LEGACY_TABLES = [
  'house',
  'pattern',
  'ball',
  'league',
  'week',
  'game',
  'frame',
];

/**
 * The columns each dialect's tables declare, measured from the captain's two
 * fixtures (and matching the DDL the two writers emit): Android carries the
 * wider set, iOS simply does not declare `sortOrder`, `lane`, `pocket`,
 * `footBoard` or `targetBoard`. The key column is first, as the reader reads
 * it first.
 */
const ANDROID_COLUMNS: Record<string, string[]> = {
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
};

/**
 * The same seven tables, narrowed the way the iOS dialect narrows them and
 * keyed `pk` instead of `_id`.
 */
const IOS_COLUMNS: Record<string, string[]> = {
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
};

/** The legacy table names, spelled the way the reader's rows are keyed. */
const ROW_KEYS: Record<string, string> = {
  house: 'houses',
  pattern: 'patterns',
  ball: 'balls',
  league: 'leagues',
  week: 'weeks',
  game: 'games',
  frame: 'frames',
};

/**
 * The primary clone's root, found through this clone's own `.git` pointer
 * rather than a hardcoded path: in the primary clone `.git` is a directory,
 * and in a worktree it is a `gitdir:` file pointing inside the primary clone's
 * `.git`, whose parent is that clone's root. The fixtures are untracked, so
 * they exist only there.
 */
function primaryCloneRoot(): string {
  const repoRoot = resolve(__dirname, '../..');

  let pointer: string;

  try {
    pointer = readFileSync(join(repoRoot, '.git'), 'utf8');
  } catch {
    // `.git` is a directory: this clone is the primary one.
    return repoRoot;
  }

  let current = resolve(
    dirname(join(repoRoot, '.git')),
    pointer.replace(/^gitdir:\s*/, '').trim()
  );

  while (basename(current) !== '.git') {
    const parent = dirname(current);

    if (parent === current) {
      return repoRoot;
    }

    current = parent;
  }

  return dirname(current);
}

/** The two untracked personal backups, keyed by the dialect they came from. */
const FIXTURE_FILENAMES: Record<string, string> = {
  android: 'cortez-android.pinpal',
  ios: 'tj-ios.pinpal',
};

/** One fixture's path, or `null` when that personal file is absent. */
function fixturePath(dialect: string): string | null {
  const candidate = join(
    primaryCloneRoot(),
    'fixtures',
    'pinpal',
    FIXTURE_FILENAMES[dialect]
  );

  return existsSync(candidate) ? candidate : null;
}

/** One fixture's bytes, or `null` when that personal file is absent. */
function fixtureBytes(dialect: string): Uint8Array | null {
  const file = fixturePath(dialect);

  return file === null ? null : Uint8Array.from(readFileSync(file));
}

/**
 * A handle on one fixture's SQLite image. Android's image is the file, so it
 * is opened in place; iOS's image sits behind the plist wrapper, so the image
 * is copied to a scratch file under the OS temp dir — the fixture itself is
 * still only ever read, and the scratch copy is never a tracked path.
 */
function openFixtureImage(dialect: string): DatabaseSync {
  const file = fixturePath(dialect);

  if (file === null) {
    throw new Error(`Fixture ${dialect} is absent; the caller must skip.`);
  }

  if (dialect === 'android') {
    return new DatabaseSync(file);
  }

  const imagePath = join(
    scratchDirectory,
    `fixture-image-${(scratchIndex += 1)}.sqlite`
  );

  writeFileSync(
    imagePath,
    Uint8Array.from(readFileSync(file)).slice(COMPOUND_SQLITE_OFFSET)
  );

  return new DatabaseSync(imagePath);
}

/** How many rows a fixture's own SQLite image holds per legacy table. */
function fixtureRowCounts(dialect: string): Record<string, number> {
  const db = openFixtureImage(dialect);

  try {
    return Object.fromEntries(
      LEGACY_TABLES.map((table) => [
        table,
        Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n ?? 0),
      ])
    );
  } finally {
    db.close();
  }
}

/**
 * The DDL a fixture's own tables carry, read back from its `sqlite_schema`.
 * This is the foreign writer's spelling made visible: PinPal quotes its
 * identifiers, which is the one thing the reader's old text check could not
 * survive.
 */
function fixtureDeclarations(dialect: string): string[] {
  const db = openFixtureImage(dialect);

  try {
    return db
      .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table'")
      .all()
      .map((row) => String(row.sql));
  } finally {
    db.close();
  }
}

/**
 * A SQLite image written by a foreign hand: the seven legacy tables of one
 * dialect, spelled with the quoting, keyword casing and whitespace the caller
 * asks for, each carrying one row. Nothing here is emitted by this
 * repository's writers, which is the point — the reader must name the dialect
 * from the schema, not from a spelling it happens to recognise.
 */
function foreignWriterImage(
  dialect: string,
  quote: string,
  keywordCase: string,
  gap: string
): Uint8Array {
  const columns = dialect === 'android' ? ANDROID_COLUMNS : IOS_COLUMNS;
  const path = join(scratchDirectory, `foreign-${(scratchIndex += 1)}.sqlite`);
  const db = new DatabaseSync(path);

  try {
    db.exec(
      LEGACY_TABLES.map((table) => {
        const declared = columns[table];

        return `CREATE TABLE ${table} (${declared
          .map((column, index) => {
            const name = quote === '' ? column : `${quote}${column}${quote}`;
            const type =
              column === 'name' || column === 'notes' ? 'TEXT' : 'INTEGER';
            const key = index === 0 ? ` ${keywordCase} PRIMARY KEY` : '';

            return `${name} ${type}${key}`;
          })
          .join(`,${gap}`)});`;
      }).join('\n')
    );

    for (const table of LEGACY_TABLES) {
      const declared = columns[table];

      db.prepare(
        `INSERT INTO ${table} (${declared.join(', ')}) VALUES (${declared.map(() => '?').join(', ')})`
      ).run(
        ...declared.map((column, index) => {
          if (column === 'name' || column === 'notes') {
            return 'x';
          }

          return index === 0 ? 1 : 0;
        })
      );
    }
  } finally {
    db.close();
  }

  return Uint8Array.from(readFileSync(path));
}

/**
 * The same seven tables, but with the key column NOT the primary key: an
 * `_id` column that is an ordinary column, with the primary key sitting on
 * `name` instead. A PinPal file never looks like this, and the reader must
 * not name a dialect for it.
 */
function keyColumnNotPrimaryKeyImage(): Uint8Array {
  const path = join(
    scratchDirectory,
    `not-keyed-${(scratchIndex += 1)}.sqlite`
  );
  const db = new DatabaseSync(path);

  try {
    db.exec(
      LEGACY_TABLES.map((table) => {
        const declared = ANDROID_COLUMNS[table].filter(
          (column) => column !== 'name'
        );

        return `CREATE TABLE ${table} (name TEXT PRIMARY KEY, ${declared.map((column) => `${column} INTEGER`).join(', ')});`;
      }).join('\n')
    );
  } finally {
    db.close();
  }

  return Uint8Array.from(readFileSync(path));
}

/**
 * A SQLite image holding the journal's OWN tables — `id TEXT PRIMARY KEY`,
 * none of them named with a legacy table name. The journal is a local
 * database, not a PinPal backup, and must still be refused.
 */
function journalDatabaseImage(): Uint8Array {
  const path = join(
    scratchDirectory,
    `journal-image-${(scratchIndex += 1)}.sqlite`
  );
  const db = new DatabaseSync(path);

  try {
    db.exec(
      [
        'CREATE TABLE balls (id TEXT PRIMARY KEY, name TEXT);',
        'CREATE TABLE houses (id TEXT PRIMARY KEY, name TEXT);',
        'CREATE TABLE frames (id TEXT PRIMARY KEY, game_id TEXT);',
      ].join('\n')
    );
  } finally {
    db.close();
  }

  return Uint8Array.from(readFileSync(path));
}

/**
 * The iOS compound container: an app-state plist wrapper, then the SQLite
 * image at byte offset 4096 — the shape the captain's iOS file carries, and
 * the shape the reader requires before it will name the iOS dialect at all
 * (a raw container holding `pk` keys is a hybrid neither device writes).
 */
function compoundContainer(image: Uint8Array): Uint8Array {
  const wrapper = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n<key>app-state</key>\n<string>pinpal</string>\n</dict>\n</plist>\n'
  );
  const prefix = Buffer.alloc(COMPOUND_SQLITE_OFFSET, 0x20);

  wrapper.copy(prefix);

  return Uint8Array.from(Buffer.concat([prefix, Buffer.from(image)]));
}

/** Row counts of one image's legacy tables, as the reader hands them back. */
function rowCountCounts(rows: PinPalLegacyRows): Record<string, number> {
  return {
    houses: rows.houses.length,
    patterns: rows.patterns.length,
    balls: rows.balls.length,
    leagues: rows.leagues.length,
    weeks: rows.weeks.length,
    games: rows.games.length,
    frames: rows.frames.length,
  };
}

/** One fixture's row counts, spelled the way the reader's rows are keyed. */
function fixtureCountsAsRows(dialect: string): Record<string, number> {
  return Object.fromEntries(
    Object.entries(fixtureRowCounts(dialect)).map(([table, count]) => [
      ROW_KEYS[table],
      count,
    ])
  );
}

test("the captain's real Android backup is accepted as the Android dialect", async (t) => {
  const bytes = fixtureBytes('android');

  if (bytes === null) {
    t.skip('the captain Android backup file is not in this clone');
    return;
  }

  const declarations = fixtureDeclarations('android');
  const expected = fixtureCountsAsRows('android');

  // The foreign spelling: PinPal quotes its key column, which is the one
  // thing a text check for `_id` followed by `INTEGER` cannot survive.
  assert.ok(
    declarations.some((declaration) =>
      /CREATE TABLE \w+ \('_id' INTEGER PRIMARY KEY/i.test(declaration)
    ),
    'the fixture is not the foreign spelling this suite is about'
  );

  const image: PinpalBackupImage = await readPinPalBackupImage(bytes);

  assert.strictEqual(image.dialect, 'android');
  assert.deepStrictEqual(rowCountCounts(image.rows), expected);
});

test("the captain's real iOS backup is accepted as the iOS dialect", async (t) => {
  const bytes = fixtureBytes('ios');

  if (bytes === null) {
    t.skip('the captain iOS backup file is not in this clone');
    return;
  }

  const declarations = fixtureDeclarations('ios');
  const expected = fixtureCountsAsRows('ios');

  assert.ok(
    declarations.some((declaration) =>
      /CREATE TABLE \w+ \('pk' INTEGER PRIMARY KEY/i.test(declaration)
    ),
    'the fixture is not the foreign spelling this suite is about'
  );

  const image: PinpalBackupImage = await readPinPalBackupImage(bytes);

  assert.strictEqual(image.dialect, 'ios');
  assert.deepStrictEqual(rowCountCounts(image.rows), expected);
});

test('quoting, casing and spacing cannot change the dialect it names', async () => {
  const spellings: [string, string, string][] = [
    ["'", 'INTEGER', ' '],
    ['"', 'INTEGER', ' '],
    ['`', 'INTEGER', ' '],
    ['', 'INTEGER', ' '],
    ["'", 'integer', ' '],
    ["'", 'INTEGER', '   '],
    ["'", 'INTEGER', '\n  '],
  ];

  for (const [quote, keywordCase, gap] of spellings) {
    const android = await readPinPalBackupImage(
      foreignWriterImage('android', quote, keywordCase, gap)
    );
    const ios = await readPinPalBackupImage(
      compoundContainer(foreignWriterImage('ios', quote, keywordCase, gap))
    );

    assert.strictEqual(android.dialect, 'android');
    assert.strictEqual(ios.dialect, 'ios');
    assert.ok(
      Object.values(rowCountCounts(android.rows)).every((count) => count === 1)
    );
    assert.ok(
      Object.values(rowCountCounts(ios.rows)).every((count) => count === 1)
    );
  }
});

test('a file that is not a PinPal backup is still refused', async () => {
  // The journal's own database: a local SQLite file, not a PinPal backup.
  await assert.rejects(
    async () => await readPinPalBackupImage(journalDatabaseImage()),
    /not a PinPal backup/
  );

  // An `_id` column that is not the table's primary key.
  await assert.rejects(
    async () => await readPinPalBackupImage(keyColumnNotPrimaryKeyImage()),
    /not a PinPal backup/
  );

  // A `.json` envelope wearing a `.db` name: no SQLite image at all.
  const json = Buffer.from('{"journal":true}', 'utf8');

  await assert.rejects(
    async () => await readPinPalBackupImage(Uint8Array.from(json)),
    /not a PinPal backup/
  );
});
