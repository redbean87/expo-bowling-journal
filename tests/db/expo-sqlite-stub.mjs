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
// It is wired in from `a3-canonical-migrations.test.ts` via an on-thread
// `module.registerHooks` resolve remap. It is not imported by app code and is
// not a package dependency (it uses only Node built-ins).

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

export const openDatabaseAsync = async (_name) => {
  const db = new DatabaseSync(':memory:');
  return new NodeBackedSqliteAdapter(db);
};
