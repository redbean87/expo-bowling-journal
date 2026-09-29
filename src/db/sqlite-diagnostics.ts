/**
 * Development-only SQLite diagnostics.
 *
 * These helpers exercise the *existing* shared database handle produced by
 * `src/db/database.ts` (they never open a second database) and report on the
 * state of the local SQLite store. They are intentionally defensive and
 * isolated: a single failing check records its own result without stopping the
 * remaining checks, and the only writes ever performed go to a throwaway
 * scratch table that is always dropped, so the real local journal is left
 * unchanged.
 */
import { SCHEMA_VERSION } from './database';

import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * The seven canonical local-journal tables, in a stable display order.
 * `schema.ts` is DDL-only and does not export a table-name list, so the
 * reference set lives here in the diagnostics module.
 */
export const CANONICAL_TABLE_NAMES = [
  'leagues',
  'sessions',
  'games',
  'frames',
  'balls',
  'houses',
  'patterns',
] as const;

/**
 * Scratch table used solely for the write/read/delete smoke test. It is never
 * a canonical table and is always dropped, so it can never contaminate the
 * real journal.
 */
const SCRATCH_TABLE = '__bj_sqlite_diag_scratch';

export type DiagnosticOutcome = 'pass' | 'fail' | 'unknown';

export type SqliteDiagnosticsReport = {
  /** Whether the shared handle answered a probe. */
  open: 'open' | 'failed' | 'unknown';
  /**
   * Derived from the recorded `user_version`:
   * - `initialized` when it equals `SCHEMA_VERSION`,
   * - `not-initialized` when it is `0`,
   * - `stale` for any other non-zero value,
   * - `unknown` when it could not be read.
   */
  initialization: 'initialized' | 'not-initialized' | 'stale' | 'unknown';
  /** The raw `PRAGMA user_version` value, or `null` if it could not be read. */
  userVersion: number | null;
  /** Canonical table names that were found. */
  presentTables: string[];
  /** Canonical table names that were expected but not found. */
  missingTables: string[];
  /** The `PRAGMA foreign_keys` value (1 = on, 0 = off), or `null` if unreadable. */
  foreignKeyEnforcement: number | null;
  /** Result of a trivial `SELECT 1` probe. */
  readTest: DiagnosticOutcome;
  /**
   * Result of an isolated write → read-back → delete round-trip performed on a
   * scratch table (which is then dropped). The real journal is not touched.
   */
  writeReadDeleteSmoke: DiagnosticOutcome;
  /** Human-readable notes collected along the way (empty when all is well). */
  errors: string[];
};

async function probeUserVersion(
  db: SQLiteDatabase
): Promise<{ open: 'open' | 'failed'; userVersion: number | null }> {
  try {
    const row = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version'
    );
    return { open: 'open', userVersion: row?.user_version ?? 0 };
  } catch {
    return { open: 'failed', userVersion: null };
  }
}

async function probeForeignKeys(db: SQLiteDatabase): Promise<number | null> {
  try {
    const row = await db.getFirstAsync<{ foreign_keys: number }>(
      'PRAGMA foreign_keys'
    );
    return row?.foreign_keys ?? null;
  } catch {
    return null;
  }
}

async function probeReadTest(db: SQLiteDatabase): Promise<DiagnosticOutcome> {
  try {
    const row = await db.getFirstAsync<{ ok: number }>('SELECT 1 AS ok');
    return row?.ok === 1 ? 'pass' : 'fail';
  } catch {
    return 'fail';
  }
}

async function probeCanonicalTables(
  db: SQLiteDatabase
): Promise<{ presentTables: string[]; missingTables: string[] }> {
  try {
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    );
    const names = new Set(rows.map((row) => row.name));
    const presentTables = CANONICAL_TABLE_NAMES.filter((name) =>
      names.has(name)
    );
    const missingTables = CANONICAL_TABLE_NAMES.filter(
      (name) => !names.has(name)
    );
    return { presentTables, missingTables };
  } catch {
    return { presentTables: [], missingTables: [...CANONICAL_TABLE_NAMES] };
  }
}

async function probeWriteReadDeleteSmoke(
  db: SQLiteDatabase
): Promise<DiagnosticOutcome> {
  const id = 'dsh-sqlite-diagnostics';
  try {
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS ${SCRATCH_TABLE} (id TEXT PRIMARY KEY, payload TEXT)`
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO ${SCRATCH_TABLE} (id, payload) VALUES (?, ?)`,
      id,
      'dsh-sqlite-diagnostics'
    );
    const row = await db.getFirstAsync<{ payload: string }>(
      `SELECT payload FROM ${SCRATCH_TABLE} WHERE id = ?`,
      id
    );
    if (row?.payload !== 'dsh-sqlite-diagnostics') {
      throw new Error('scratch read-back mismatch');
    }
    await db.runAsync(`DELETE FROM ${SCRATCH_TABLE} WHERE id = ?`, id);
    const remaining = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${SCRATCH_TABLE}`
    );
    if (remaining?.n !== 0) {
      throw new Error('scratch row not deleted');
    }
    await db.execAsync(`DROP TABLE IF EXISTS ${SCRATCH_TABLE}`);
    return 'pass';
  } catch {
    // Best-effort cleanup so no scratch artifact survives a failed probe.
    try {
      await db.execAsync(`DROP TABLE IF EXISTS ${SCRATCH_TABLE}`);
    } catch {
      // Ignore: nothing more to do if cleanup itself fails.
    }
    return 'fail';
  }
}

export interface RunSqliteDiagnosticsOptions {
  /**
   * Optional progress reporter. Called synchronously, exactly once, right
   * before each probe step begins (five steps, which together produce the
   * seven reported checks). It is used purely for UI progress reporting: it
   * is never awaited, its return value is ignored, and it cannot influence
   * the diagnostic outcome.
   */
  onProgress?: (currentCheck: string) => void;
}

/**
 * Run the development-only SQLite diagnostics against an already-open shared
 * database handle. Never opens a second database and never writes to a
 * canonical table.
 */
export async function runSqliteDiagnostics(
  db: SQLiteDatabase,
  options?: RunSqliteDiagnosticsOptions
): Promise<SqliteDiagnosticsReport> {
  const onProgress = options?.onProgress;
  const errors: string[] = [];

  onProgress?.('Reading schema version (open / initialization)');
  const openProbe = await probeUserVersion(db);

  const userVersion = openProbe.userVersion;
  let initialization: SqliteDiagnosticsReport['initialization'];
  if (userVersion === null) {
    initialization = 'unknown';
  } else if (userVersion === SCHEMA_VERSION) {
    initialization = 'initialized';
  } else if (userVersion === 0) {
    initialization = 'not-initialized';
  } else {
    initialization = 'stale';
  }

  onProgress?.('Enumerating canonical tables');
  const tables = await probeCanonicalTables(db);
  if (tables.missingTables.length > 0) {
    errors.push(`Missing canonical tables: ${tables.missingTables.join(', ')}`);
  }

  onProgress?.('Checking foreign-key enforcement');
  const foreignKeyEnforcement = await probeForeignKeys(db);
  if (foreignKeyEnforcement !== 1) {
    errors.push(
      `Foreign keys are not enforced on this connection (PRAGMA foreign_keys = ${foreignKeyEnforcement ?? 'unknown'}).`
    );
  }

  onProgress?.('Running basic read test (SELECT 1)');
  const readTest = await probeReadTest(db);
  if (readTest !== 'pass') {
    errors.push('Basic read probe (SELECT 1) did not pass.');
  }

  onProgress?.('Running write/read/delete smoke test');
  const writeReadDeleteSmoke = await probeWriteReadDeleteSmoke(db);
  if (writeReadDeleteSmoke !== 'pass') {
    errors.push(
      'Isolated write/read/delete smoke test did not pass (no canonical rows were touched).'
    );
  }

  if (openProbe.open === 'failed') {
    errors.push(
      'The shared database handle did not answer a probe; further checks may be unreliable.'
    );
  }

  return {
    open: openProbe.open,
    initialization,
    userVersion,
    presentTables: tables.presentTables,
    missingTables: tables.missingTables,
    foreignKeyEnforcement,
    readTest,
    writeReadDeleteSmoke,
    errors,
  };
}
