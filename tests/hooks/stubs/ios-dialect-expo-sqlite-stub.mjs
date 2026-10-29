// Test-support stub for the native `expo-sqlite` module, backed by Node's
// built-in `node:sqlite`, for the iOS PinPal dialect writer
// (`src/hooks/journal/export-backup/ios-pinpal-dialect.ts`).
//
// The writer opens an isolated in-memory database and calls expo-sqlite's
// serialization seam (`SQLiteDatabase.serializeAsync()`, which wraps
// `sqlite3_serialize`), so unlike `tests/db/expo-sqlite-stub.mjs` this stub
// has to hand back a real SQLite image. `node:sqlite` has no serialize API,
// so each database the stub opens is backed by its own file under one temp
// directory: `serializeAsync()` flushes that file (close, then reopen for
// any further use) and returns its bytes, which is the same raw image
// `sqlite3_serialize` returns on a device — including the page size the
// writer asked for with `PRAGMA page_size`, which is a header field both
// builds share. The journal's own database is never in play — the stub
// records every name `openDatabaseAsync` is asked for, which is how the
// suite proves the writer never touched it.
//
// It is wired in from the dialect test via an on-thread `module.registerHooks`
// resolve remap. It is not imported by app code and is not a package
// dependency (it uses only Node built-ins).

import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

const tempDirectory = mkdtempSync(join(tmpdir(), 'bj-ios-dialect-'));
const openedNames = [];

function databasePath(name) {
  if (name === ':memory:') {
    // expo-sqlite keeps `:memory:` unresolved (see pathUtils), so the writer's
    // isolated in-memory database is the one this stub backs with a temp file.
    return join(tempDirectory, `memory-${openedNames.length}`);
  }

  const segments = name.split(sep).filter((segment) => segment !== '');

  return join(tempDirectory, ...segments);
}

class NodeBackedSqliteAdapter {
  constructor(path) {
    this._path = path;
    this._db = new DatabaseSync(path);
  }

  // expo-sqlite accepts bind values as a single array or as variadic
  // arguments; `node:sqlite` binds anonymous parameters positionally.
  normalizeParams(params) {
    return params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  }

  async execAsync(sql) {
    this._db.exec(sql);
  }

  async runAsync(sql, ...params) {
    const result = this._db.prepare(sql).run(...this.normalizeParams(params));

    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync(sql, ...params) {
    const row = this._db.prepare(sql).get(...this.normalizeParams(params));

    return row == null ? null : row;
  }

  async getAllAsync(sql, ...params) {
    return this._db.prepare(sql).all(...this.normalizeParams(params));
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

  // expo-sqlite's `SQLiteDatabase.serializeAsync(databaseName = 'main')`:
  // "main" is the name SQLite gives the main database of a plain open, so the
  // default the writer relies on is the name this stub accepts.
  async serializeAsync(name = 'main') {
    if (name !== 'main') {
      throw new Error(`Unknown SQLite database name: ${name}`);
    }

    this._db.close();

    const serialized = readFileSync(this._path);

    this._db = new DatabaseSync(this._path);

    return Uint8Array.from(serialized);
  }

  async closeAsync() {
    this._db.close();
  }
}

export const openDatabaseAsync = async (name, options, directory) => {
  openedNames.push(name);

  return new NodeBackedSqliteAdapter(databasePath(name));
};

// The suite reads this to prove the writer opened only its isolated
// database. It lives on `globalThis` (the seam the shared `tests/db` stub
// uses the same way) so the test never has to import this JavaScript module.
globalThis.__iosDialectOpenedDatabaseNames = openedNames;

// The temp databases are scratch evidence for one test run; they are removed
// when the runner exits.
process.on('exit', () => {
  rmSync(tempDirectory, { recursive: true, force: true });
});
