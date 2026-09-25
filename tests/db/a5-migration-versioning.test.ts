import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { CANONICAL_SCHEMA_SQL } from '../../src/db/schema';

// A5 — migration/versioning contract tests for the REAL `src/db/database.ts`.
//
// A4 (`a3-canonical-migrations.test.ts`) proves the observable end-states of
// the A3 migration system: a fresh database reaches `SCHEMA_VERSION`, repeated
// `getDatabase()` returns the cached handle, and the migration registry is
// well-formed. A4 cannot prove the applied-version GATING, because its stub
// hands back a brand-new in-memory database on every open. This file closes
// the two gaps:
//
//   1. No re-application: opening a database already recorded at
//      `SCHEMA_VERSION` runs ZERO migrations (the `version <= appliedVersion`
//      skip in `ensureDatabase`).
//   2. Retry-after-failure: a failed migration rejects, `getDatabase` clears
//      its init guard, and a later `getDatabase()` retries cleanly to
//      `SCHEMA_VERSION`.
//
// Like A4, this drives the REAL module whose `expo-sqlite` import is remapped
// (on this thread) to the `node:sqlite`-backed stub so the UNMODIFIED
// `ensureDatabase`/`getDatabase` path runs under the plain Node/tsx runner.
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

type DatabaseModule = typeof import('../../src/db/database');
type DatabaseHandle = Awaited<ReturnType<DatabaseModule['getDatabase']>>;
type MigrationUp = (db: DatabaseHandle) => Promise<void>;

// Dynamic import is required so the `expo-sqlite` remap (registered above) is
// in effect when `database.ts` resolves its import.
async function loadDatabaseModule(): Promise<DatabaseModule> {
  return import('../../src/db/database');
}

// Reset the module-level singleton so each test starts from a clean handle.
async function reset(module: DatabaseModule): Promise<void> {
  await module.closeDatabase();
}

async function userVersion(db: DatabaseHandle): Promise<number> {
  const versionRow = (await db.getFirstAsync('PRAGMA user_version')) as {
    user_version: number;
  };
  return versionRow.user_version;
}

// Seam (see expo-sqlite-stub.mjs): register a factory so `openDatabaseAsync`
// returns a database the test pre-configured. Stored on `globalThis` (not
// module state) so it is visible to whichever stub instance `database.ts`
// resolves under the remap; only the tests below set it.
const SEAMS_KEY = '__bowlingJournalDbSeeds';
type Seams = Map<string, () => DatabaseSync>;
function setSeams(seams: Seams): void {
  (globalThis as unknown as Record<string, unknown>)[SEAMS_KEY] = seams;
}
function clearSeams(): void {
  const seams = (globalThis as unknown as Record<string, unknown>)[
    SEAMS_KEY
  ] as Seams | undefined;
  seams?.clear();
  (globalThis as unknown as Record<string, unknown>)[SEAMS_KEY] = undefined;
}

test('opening a database already at SCHEMA_VERSION applies zero migrations (no re-application)', async () => {
  const dbModule = await loadDatabaseModule();
  await reset(dbModule);

  // Pre-configure a database already recorded at the target schema version, as
  // a prior migration run would have left it: schema applied + user_version set.
  const seams = new Map<string, () => DatabaseSync>();
  setSeams(seams);
  seams.set(dbModule.DATABASE_NAME, () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(CANONICAL_SCHEMA_SQL);
    db.exec(`PRAGMA user_version = ${dbModule.SCHEMA_VERSION}`);
    return db;
  });

  // Count each migration's `up` invocations so we can assert none re-run.
  const originalUps: MigrationUp[] = dbModule.MIGRATIONS.map((m) => m.up);
  const upCalls = dbModule.MIGRATIONS.map(() => 0);
  dbModule.MIGRATIONS.forEach((m, index) => {
    m.up = (db) => {
      upCalls[index] += 1;
      return originalUps[index](db);
    };
  });

  try {
    const db = await dbModule.getDatabase();
    assert.equal(await userVersion(db), dbModule.SCHEMA_VERSION);
    // The applied-version gate (`migration.version <= appliedVersion`) must skip
    // every migration once the recorded version already equals the target.
    assert.deepEqual(
      upCalls,
      dbModule.MIGRATIONS.map(() => 0),
      'no migration may re-apply to an already-migrated database'
    );
  } finally {
    dbModule.MIGRATIONS.forEach((m, index) => {
      m.up = originalUps[index];
    });
    clearSeams();
    await reset(dbModule);
  }
});

test('a failed migration rejects, clears the init guard, and a later getDatabase retries cleanly', async () => {
  const dbModule = await loadDatabaseModule();
  await reset(dbModule);

  // Force the v2 (canonical schema) migration to fail on the first open.
  const originalUp = dbModule.MIGRATIONS[1].up;
  dbModule.MIGRATIONS[1].up = async () => {
    throw new Error('a5: forced migration failure');
  };

  let firstError: unknown;
  let firstCallRejected = false;
  try {
    await dbModule.getDatabase();
  } catch (error) {
    firstError = error;
    firstCallRejected = true;
  }

  // Restore the real migration so the retry can succeed.
  dbModule.MIGRATIONS[1].up = originalUp;

  try {
    assert.equal(
      firstCallRejected,
      true,
      'expected the first getDatabase() to reject on the failed migration'
    );
    // The `.catch` in `getDatabase` must clear the init guard; otherwise this
    // call would return the stale rejected promise and never re-run.
    const db = await dbModule.getDatabase();
    assert.equal(await userVersion(db), dbModule.SCHEMA_VERSION);
  } finally {
    await reset(dbModule);
  }

  assert.match(String(firstError), /a5: forced migration failure/);
});
