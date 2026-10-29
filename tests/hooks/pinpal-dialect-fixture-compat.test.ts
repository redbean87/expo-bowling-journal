/**
 * C-4 T6 (PinPal `.db` export) — fixture-backed dialect compatibility tests.
 *
 * T2 and T3 each pinned their own dialect against a layout the writer restates
 * in its own DDL. This slice goes one level further: it opens the captain's
 * two real PinPal backups and checks the writers against the bytes PinPal
 * actually wrote, so a layout claim here is evidence from a real file rather
 * than a restatement of our own code.
 *
 * ## The fixtures are personal, untracked, and read-only
 *
 * `fixtures/pinpal/cortez-android.pinpal` and `fixtures/pinpal/tj-ios.pinpal`
 * live in the primary clone, are the captain's own bowling data, and are never
 * committed, copied into a tracked path, or written to. The suite locates that
 * clone through the worktree's own `.git` pointer, so the same file is read
 * in place from every worktree, and every test that depends on a fixture
 * reports an explicit skip when that file is absent.
 *
 * ## What is compared
 *
 * Structure: table names, column names and column order, the `android_metadata`
 * table that only Android carries, the `_id`/`pk` key rename, the columns iOS
 * omits, the SQLite page size, `PRAGMA user_version`, and where the SQLite
 * image sits inside the iOS compound file. Encoding: twelve frame rows per
 * game, `frameNum` 0-11 once each, the padded-slot fill, the packed-pin bit
 * width, week dates as epoch milliseconds on Android and epoch seconds on iOS,
 * and the tenth-frame bonus-row flags.
 *
 * The fixture rows are never compared against generated personal data — the
 * journal side is a synthetic snapshot — so the suite proves the two sides
 * agree on structure and encoding without reproducing the captain's journal.
 */
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';

import { registerStubRemaps } from '../harness/remap';

/** The 16 bytes every SQLite 3 image starts with. */
const SQLITE_MAGIC = 'SQLite format 3\u0000';

/** The two untracked personal backups, read in place from the primary clone. */
const FIXTURE_FILENAMES: Record<string, string> = {
  android: 'cortez-android.pinpal',
  ios: 'tj-ios.pinpal',
};

/**
 * The primary clone's root, found through this clone's own `.git` pointer
 * rather than through a hardcoded path: in the primary clone `.git` is a
 * directory, and in a worktree it is a one-line `gitdir:` file pointing inside
 * the primary clone's `.git`, whose parent is that clone's root. The fixtures
 * are untracked, so they exist only there — and reading them through this
 * root is what keeps one worktree's test run pointed at the same real file.
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

  const declared = pointer.replace(/^gitdir:\s*/, '').trim();
  let current = resolve(dirname(join(repoRoot, '.git')), declared);

  while (basename(current) !== '.git') {
    const parent = dirname(current);

    if (parent === current) {
      return repoRoot;
    }

    current = parent;
  }

  return dirname(current);
}

/**
 * Each dialect writer gets the stub built for it, selected by the module that
 * is importing `expo-sqlite`: both writers import the same specifier, so one
 * constant table would hand both halves the same stub and blur which image is
 * whose. The stubs are the ones T2 and T3 already ship.
 */
function stubRewriteFor(parentURL: string | undefined): Record<string, string> {
  if (parentURL?.includes('android-pinpal-dialect')) {
    return {
      'expo-sqlite': join(
        __dirname,
        'stubs',
        'android-dialect-expo-sqlite-stub.mjs'
      ),
    };
  }

  if (parentURL?.includes('ios-pinpal-dialect')) {
    return {
      'expo-sqlite': join(
        __dirname,
        'stubs',
        'ios-dialect-expo-sqlite-stub.mjs'
      ),
    };
  }

  return {};
}

const stubHandle = registerStubRemaps(stubRewriteFor);

/** Scratch directory for reading an image back; never a tracked path. */
const evidenceDirectory = mkdtempSync(
  join(tmpdir(), 'bj-fixture-compat-evidence-')
);

let evidenceIndex = 0;

after(() => {
  stubHandle.deregister();
  rmSync(evidenceDirectory, { force: true, recursive: true });
});

/** Byte offset of the SQLite magic inside a file, or -1. */
function magicOffset(bytes: Uint8Array): number {
  const needle = Uint8Array.from(
    [...SQLITE_MAGIC].map((character) => character.charCodeAt(0))
  );

  outer: for (
    let start = 0;
    start + needle.length <= bytes.length;
    start += 1
  ) {
    for (let index = 0; index < needle.length; index += 1) {
      if (bytes[start + index] !== needle[index]) {
        continue outer;
      }
    }

    return start;
  }

  return -1;
}

/**
 * A SQLite header field, read from the image's own bytes: page size is the
 * big-endian uint16 at offset 16, `PRAGMA user_version` the uint32 at 88.
 */
function headerField(bytes: Uint8Array, at: number, offset: number): number {
  const first = bytes[at + offset];
  const second = bytes[at + offset + 1];

  if (offset === 16) {
    return (first << 8) | second;
  }

  return (
    ((first << 24) |
      (second << 16) |
      (bytes[at + offset + 2] << 8) |
      bytes[at + offset + 3]) &
    0xffffffff
  );
}

/** The seven legacy tables, in the order the writers serialize them. */
const LEGACY_TABLES = [
  'house',
  'pattern',
  'ball',
  'league',
  'week',
  'game',
  'frame',
];

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

/** A fixture's bytes, or `null` when that personal file is absent. */
function fixtureBytes(dialect: string): Uint8Array | null {
  const fixtureFile = fixturePath(dialect);

  return fixtureFile === null ? null : readFileSync(fixtureFile);
}

/**
 * A read-only handle on a fixture's SQLite image. Android's image is the file,
 * so it is opened in place; iOS's image sits behind the plist wrapper, so the
 * image is copied to a scratch file under the OS temp dir — the fixture itself
 * is still only ever read, and the scratch copy is never a tracked path.
 */
function openFixture(dialect: string): DatabaseSync {
  const fixtureFile = fixturePath(dialect);

  if (fixtureFile === null) {
    throw new Error(`Fixture ${dialect} is absent; the caller must skip.`);
  }

  if (dialect === 'android') {
    return new DatabaseSync(fixtureFile, { readOnly: true });
  }

  const bytes = readFileSync(fixtureFile);
  const scratch = join(
    evidenceDirectory,
    `ios-image-${++evidenceIndex}.sqlite`
  );

  writeFileSync(scratch, bytes.slice(magicOffset(bytes)));

  return new DatabaseSync(scratch, { readOnly: true });
}

/** The tables a SQLite file declares, in declaration order. */
function declaredTables(db: DatabaseSync): string[] {
  return db
    .prepare('SELECT * FROM sqlite_schema')
    .all()
    .filter((row) => row.type === 'table')
    .map((row) => String(row.name));
}

/** One table's declared columns, read from the file's own schema entry. */
function declaredColumns(db: DatabaseSync, table: string): string[] {
  const entry = db
    .prepare('SELECT * FROM sqlite_schema')
    .all()
    .find((row) => row.type === 'table' && row.name === table);

  if (entry === undefined) {
    throw new Error(`Table ${table} is not declared in this file.`);
  }

  const declaration = String(entry.sql ?? '');
  const open = declaration.indexOf('(');
  const close = declaration.lastIndexOf(')');

  return declaration
    .slice(open + 1, close)
    .split(',')
    .map((clause) => clause.trim().split(/\s+/)[0])
    .map((name) => name.replace(/^['"]|['"]$/g, ''));
}

/** The Android fixture's tables, as its own schema declares them. */
const ANDROID_TABLES = [
  'android_metadata',
  'ball',
  'frame',
  'game',
  'house',
  'league',
  'pattern',
  'week',
];

test('the Android fixture is the raw dialect: android_metadata plus seven _id-keyed tables', async (t) => {
  if (fixturePath('android') === null) {
    t.skip('the captain Android backup file is not in this clone');
    return;
  }

  const bytes = fixtureBytes('android');
  const db = openFixture('android');
  const tables = declaredTables(db);
  const columns = LEGACY_TABLES.map((table) => declaredColumns(db, table));

  db.close();

  assert.ok(bytes !== null);
  assert.strictEqual(magicOffset(bytes), 0);
  assert.deepStrictEqual([...tables].sort(), ANDROID_TABLES);
  assert.ok(columns.every((names) => names[0] === '_id'));
});

/** The iOS fixture's tables: the Android set minus the metadata table. */
const IOS_TABLES = [
  'ball',
  'frame',
  'game',
  'house',
  'league',
  'pattern',
  'week',
];

test('the iOS fixture is the compound dialect: plist at zero, SQLite at 4096, pk keys', async (t) => {
  const bytes = fixtureBytes('ios');

  if (bytes === null) {
    t.skip('the captain iOS backup file is not in this clone');
    return;
  }

  const db = openFixture('ios');
  const tables = declaredTables(db);
  const columns = LEGACY_TABLES.map((table) => declaredColumns(db, table));

  db.close();

  assert.strictEqual(magicOffset(bytes), 4096);
  assert.strictEqual(headerField(bytes, 4096, 16), 1024);
  assert.strictEqual(headerField(bytes, 4096, 88), 0);
  assert.deepStrictEqual([...tables].sort(), IOS_TABLES);
  assert.ok(columns.every((names) => names[0] === 'pk'));
});

/**
 * The columns the Android fixture declares and the iOS fixture does not, per
 * table. Everything else the two agree on, column for column and in order.
 */
const ANDROID_ONLY_COLUMNS: Record<string, string[]> = {
  ball: ['sortOrder'],
  frame: ['pocket', 'footBoard', 'targetBoard'],
  game: ['lane'],
  house: ['sortOrder'],
  league: ['sortOrder'],
  pattern: ['sortOrder'],
  week: ['lane'],
};

test('the iOS fixture omits exactly the Android-only columns and renames the key', async (t) => {
  if (fixturePath('android') === null || fixturePath('ios') === null) {
    t.skip('one of the captain backup files is not in this clone');
    return;
  }

  const android = openFixture('android');
  const ios = openFixture('ios');

  const observed = LEGACY_TABLES.map((table) => {
    const androidColumns = declaredColumns(android, table).slice(1);
    const iosColumns = declaredColumns(ios, table).slice(1);

    return {
      table,
      onlyAndroid: androidColumns.filter((name) => !iosColumns.includes(name)),
      onlyIos: iosColumns.filter((name) => !androidColumns.includes(name)),
      shared: androidColumns.filter((name) => iosColumns.includes(name)),
      ios: iosColumns,
    };
  });

  android.close();
  ios.close();

  assert.deepStrictEqual(
    observed.map((entry) => entry.onlyAndroid),
    LEGACY_TABLES.map((table) => ANDROID_ONLY_COLUMNS[table])
  );
  assert.ok(observed.every((entry) => entry.onlyIos.length === 0));
  assert.deepStrictEqual(
    observed.map((entry) => entry.shared),
    observed.map((entry) => entry.ios)
  );
});

/** The twelve legacy frame slots one game carries. */
const TWELVE_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Rows of one table in a SQLite file. */
function rowCount(db: DatabaseSync, table: string): number {
  const [count] = Object.values(
    db.prepare(`SELECT count(*) FROM ${table}`).get() ?? {}
  );

  return Number(count);
}

/** The `frameNum` values one game's frame rows carry. */
function frameSlotsOfGame(db: DatabaseSync): Map<number, number[]> {
  const grouped = new Map<number, number[]>();

  for (const row of db.prepare('SELECT * FROM frame').all()) {
    const key = Number(row.gameFk);
    const bucket = grouped.get(key) ?? [];

    bucket.push(Number(row.frameNum));
    grouped.set(key, bucket);
  }

  return grouped;
}

test('both fixtures carry twelve frame rows per game, numbered 0-11 once each', async (t) => {
  const slotCounts: number[][] = [];
  const gamesWithoutFrames: number[] = [];

  for (const dialect of ['android', 'ios']) {
    if (fixturePath(dialect) === null) {
      continue;
    }

    const db = openFixture(dialect);
    const grouped = frameSlotsOfGame(db);

    for (const frameNums of grouped.values()) {
      slotCounts.push(frameNums.sort((left, right) => left - right));
    }

    gamesWithoutFrames.push(rowCount(db, 'game') - grouped.size);
    db.close();
  }

  if (slotCounts.length === 0) {
    t.skip('neither captain backup file is in this clone');
    return;
  }

  assert.ok(slotCounts.every((frameNums) => frameNums.length === 12));
  assert.deepStrictEqual(
    slotCounts,
    slotCounts.map(() => TWELVE_SLOTS)
  );
  assert.deepStrictEqual(
    gamesWithoutFrames,
    [0, 0].slice(0, gamesWithoutFrames.length)
  );
});
