import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

// These tests drive the REAL `src/db/database.ts` implementation — its
// `SCHEMA_VERSION`, `MIGRATIONS` registry, `ensureDatabase`, and the private
// `assertMigrationsValid` guard — through the public `getDatabase`/
// `closeDatabase` API. That module imports the native `expo-sqlite` package,
// which cannot load under the plain Node/tsx runner, so the bare specifier
// `expo-sqlite` is remapped to a local `node:sqlite`-backed stub for this
// file only. The remap is registered on this thread via `registerHooks` (the
// async `module.register` API does not intercept under the tsx runner) and is
// deregistered once this file's tests complete.
const stubUrl = pathToFileURL(
  path.join(__dirname, 'expo-sqlite-stub.mjs')
).href;

const hookHandle = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-sqlite') {
      return { url: stubUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

after(() => {
  hookHandle.deregister();
});

const CANONICAL_TABLES = [
  'balls',
  'frames',
  'games',
  'houses',
  'leagues',
  'patterns',
  'sessions',
];

type DatabaseModule = typeof import('../../src/db/database');

// Dynamic import is required so the `expo-sqlite` remap (registered above) is
// in effect when `database.ts` resolves its import.
async function loadDatabaseModule(): Promise<DatabaseModule> {
  return import('../../src/db/database');
}

// Reset the module-level singleton so each test starts from an empty
// in-memory database, then let the REAL `getDatabase()` run the migration.
async function freshDatabase(module: DatabaseModule) {
  await module.closeDatabase();
  return module.getDatabase();
}

type DatabaseHandle = Awaited<ReturnType<DatabaseModule['getDatabase']>>;

async function assertTableExists(db: DatabaseHandle, table: string) {
  const row = await db.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
    table
  );
  assert.ok(row, `expected table "${table}" to exist`);
}

test('a fresh database migrates from the A2 baseline to schema version 2', async () => {
  const dbModule = await loadDatabaseModule();
  const db = await freshDatabase(dbModule);

  const versionRow = (await db.getFirstAsync('PRAGMA user_version')) as {
    user_version: number;
  };
  assert.equal(versionRow.user_version, 2);
  assert.equal(dbModule.SCHEMA_VERSION, 2);

  // The migration created every canonical table. A successful `getDatabase()`
  // also proves the private `assertMigrationsValid()` accepted the registry.
  for (const table of CANONICAL_TABLES) {
    await assertTableExists(db, table);
  }

  await dbModule.closeDatabase();
});

test('schema initialization is idempotent across repeated getDatabase() and close/reopen', async () => {
  const dbModule = await loadDatabaseModule();

  const first = await dbModule.getDatabase();
  const second = await dbModule.getDatabase();
  // A second call returns the same already-initialized handle (no re-migration).
  assert.equal(second, first);

  await dbModule.closeDatabase();
  const reopened = await dbModule.getDatabase();
  // Re-opening re-runs the migration cleanly to the same version and catalog.
  const versionRow = (await reopened.getFirstAsync('PRAGMA user_version')) as {
    user_version: number;
  };
  assert.equal(versionRow.user_version, dbModule.SCHEMA_VERSION);
  for (const table of CANONICAL_TABLES) {
    await assertTableExists(reopened, table);
  }

  await dbModule.closeDatabase();
});

test('the migration registry is 1-based, strictly ascending, unique, and capped at SCHEMA_VERSION', async () => {
  const dbModule = await loadDatabaseModule();

  assert.equal(dbModule.SCHEMA_VERSION, 2);
  assert.equal(dbModule.MIGRATIONS.length, dbModule.SCHEMA_VERSION);

  dbModule.MIGRATIONS.forEach((migration, index) => {
    // Position i holds version i+1: 1-based, ascending by one, and therefore
    // unique — the invariant the real assertMigrationsValid() enforces.
    assert.equal(
      migration.version,
      index + 1,
      `migration at position ${index} must be version ${index + 1}`
    );
    assert.ok(
      typeof migration.name === 'string' && migration.name.length > 0,
      `migration ${index + 1} must have a non-empty name`
    );
    assert.equal(
      typeof migration.up,
      'function',
      `migration ${index + 1} must define an up function`
    );
  });

  assert.equal(
    dbModule.MIGRATIONS[dbModule.MIGRATIONS.length - 1].version,
    dbModule.SCHEMA_VERSION
  );
});
