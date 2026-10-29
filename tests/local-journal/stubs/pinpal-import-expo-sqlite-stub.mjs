// Test-support stub for the native `expo-sqlite` module, backed by Node's
// built-in `node:sqlite`, for the PinPal `.db` importer
// (`src/services/local-journal/pinpal-backup-import.ts`).
//
// The importer opens a file's bytes through expo-sqlite's
// `deserializeDatabaseAsync()` seam — the import counterpart of the
// `serializeAsync()` seam the two dialect writers use — so this stub has to
// accept a real SQLite image, not just hand back an empty database. `node:sqlite`
// has no deserialize API either, so each image is written to its own file under
// one temp directory and opened from there: the same bytes, the same header
// (page size included), and the same "this file is what SQLite was handed"
// failure mode a truncated or corrupt image produces on a device.
//
// The suite also drives the two real dialect writers and the real
// `SqliteLocalJournalService`, so the stub carries the whole expo-sqlite
// runtime surface those three consume (`openDatabaseAsync`, `execAsync`,
// `runAsync`, `getFirstAsync`, `getAllAsync`, `withTransactionAsync`,
// `serializeAsync` and `closeAsync`) — the same surface
// `tests/hooks/stubs/android-dialect-expo-sqlite-stub.mjs` provides, plus the
// deserialization seam. Every database the stub opens is backed by a file in
// this temp directory, so the journal's own database is never a real file on
// the user's device, and the stub records every name `openDatabaseAsync` is
// asked for, which is how the suite proves the importer never opened it.
//
// It is wired in from the import test via an on-thread `module.registerHooks`
// resolve remap. It is not imported by app code and is not a package
// dependency (it uses only Node built-ins).

import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

const tempDirectory = mkdtempSync(join(tmpdir(), 'bj-pinpal-import-'));
const openedNames = [];
let nextImagePath = 0;

let nextOpenPath = 0;

function openPath(name) {
  const segments = name.split(sep).filter((segment) => segment !== '');

  // Every open gets its own file, so a closed-and-reopened journal starts
  // empty the way the shared `tests/db` stub's in-memory database does.
  return join(
    tempDirectory,
    `open-${(nextOpenPath += 1)}-${segments.join('-')}`
  );
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
  // default the writers rely on is the name this stub accepts.
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

export const openDatabaseAsync = async (name) => {
  openedNames.push(name);

  return new NodeBackedSqliteAdapter(openPath(name));
};

// expo-sqlite's `SQLiteDatabase.deserializeDatabaseAsync(bytes)`: the image
// becomes a database without ever touching the app's own database file. The
// stub writes the bytes it was handed to a fresh temp file and opens it, so a
// truncated or corrupt image fails with SQLite's own "file is not a database"
// error exactly as it does on a device.
export const deserializeDatabaseAsync = async (bytes) => {
  const path = join(tempDirectory, `image-${(nextImagePath += 1)}.sqlite`);

  writeFileSync(path, bytes);

  return new NodeBackedSqliteAdapter(path);
};

// The suite reads this to prove the importer and the writers opened only their
// own databases. It lives on `globalThis` (the seam the shared `tests/db` stub
// uses the same way) so the test never has to import this JavaScript module.
globalThis.__pinpalImportOpenedDatabaseNames = openedNames;

// The temp databases are scratch evidence for one test run; they are removed
// when the runner exits.
process.on('exit', () => {
  rmSync(tempDirectory, { recursive: true, force: true });
});
