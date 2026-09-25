// Test-support stub for the native `expo-sqlite` module, backed by Node's
// built-in `node:sqlite`.
//
// The A4 migration tests drive the REAL `src/db/database.ts` implementation
// (its `SCHEMA_VERSION`, `MIGRATIONS` registry, `ensureDatabase`, and
// `getDatabase`). But `database.ts` imports `expo-sqlite`, a native module
// that cannot load under the plain Node/tsx test runner. This stub provides
// the minimal expo-sqlite runtime API surface (`openDatabaseAsync`) that
// `database.ts` consumes, so the UNMODIFIED migration code path runs against
// an in-memory `node:sqlite` database.
//
// It is wired in from the DB tests (`a3-canonical-migrations.test.ts`, and A5's
// `a5-migration-versioning.test.ts`) via an on-thread `module.registerHooks`
// resolve remap. It is not imported by app code and is not a package dependency
// (it uses only Node built-ins).

import { DatabaseSync } from 'node:sqlite';

class NodeBackedSqliteAdapter {
  constructor(db) {
    this._db = db;
  }

  async execAsync(sql) {
    this._db.exec(sql);
  }

  async getFirstAsync(sql, ...params) {
    const row = this._db.prepare(sql).get(...params);
    return row == null ? null : row;
  }

  async withTransactionAsync(fn) {
    this._db.exec('BEGIN');
    try {
      await fn();
      this._db.exec('COMMIT');
    } catch (error) {
      this._db.exec('ROLLBACK');
      throw error;
    }
  }

  async closeAsync() {
    this._db.close();
  }
}

// --- Test seam: per-name database seeding (A5 migration/versioning tests) ---
//
// `database.ts` calls `openDatabaseAsync(name)`. By default that returns a
// fresh in-memory database, which is what the A4 tests rely on. A test may
// register a factory on `globalThis.__bowlingJournalDbSeeds` (a
// `Map<name, () => DatabaseSync>`) so that `openDatabaseAsync(name)` returns a
// database the test has pre-configured — for example one already brought to a
// given schema version. Storing the seam on `globalThis` (rather than module
// state) keeps it visible to whichever instance of this module `database.ts`
// resolves under a given test's `expo-sqlite` remap. Only the A5 tests set it,
// so the fresh-database behavior the A4 tests depend on is unchanged.
function seededFactory(name) {
  const seeds = globalThis.__bowlingJournalDbSeeds;
  return typeof seeds?.get === 'function' ? seeds.get(name) : undefined;
}

export const openDatabaseAsync = async (name) => {
  const factory = seededFactory(name);
  if (factory) {
    return new NodeBackedSqliteAdapter(factory());
  }
  const db = new DatabaseSync(':memory:');
  return new NodeBackedSqliteAdapter(db);
};
